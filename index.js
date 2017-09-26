var hyperkv = require('hyperkv')
var hyperkdb = require('hyperlog-kdb-index')
var kdbtree = require('kdb-tree-store')
var sub = require('subleveldown')
var randomBytes = require('randombytes')
var once = require('once')
var through = require('through2')
var to = require('to2')
var readonly = require('read-only-stream')
var xtend = require('xtend')
var join = require('hyperlog-join')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var hex2dec = require('./lib/hex2dec.js')
var lock = require('mutexify')
var defined = require('defined')
var after = require('after-all')
var mapLimit = require('async/mapLimit')
var memoize = require('memoize')

module.exports = DB
inherits(DB, EventEmitter)

function DB (opts) {
  var self = this
  if (!(self instanceof DB)) return new DB(opts)

  self.log = opts.log
  self.db = opts.db
  self.store = opts.store

  self.kv = defined(opts.kv, hyperkv({
    log: self.log,
    db: sub(self.db, 'kv')
  }))
  self.kv.on('error', function (err) { self.emit('error', err) })

  self.lock = lock()

  self._restartIndexes()
}

DB.prototype._restartIndexes = function () {
  var self = this

  if (self.kdb) self.kdb.dex.pause()
  if (self.refs) self.refs.dex.pause()
  if (self.changeset) self.changeset.dex.pause()

  self.kdb = hyperkdb({
    log: self.log,
    store: self.store,
    db: sub(self.db, 'kdb'),
    kdbtree: kdbtree,
    types: [ 'float64', 'float64' ],
    map: function (row, next) {
      if (!row.value) return null
      var v = row.value.v
      var d = row.value.d
      if (v && v.lat !== undefined && v.lon !== undefined) {
        next(null, { type: 'put', point: ptf(v) })
      } else if (d && Array.isArray(row.value.points)) {
        var pts = row.value.points.map(ptf)
        next(null, { type: 'put', points: pts })
      } else next()
    }
  })
  self.kdb.on('error', function (err) { self.emit('error', err) })

  self.refs = join({
    log: self.log,
    db: sub(self.db, 'r'),
    map: function (row, cb) {
      if (!row.value) return
      var k = row.value.k
      var v = row.value.v || {}
      var d = row.value.d
      var ops = []
      var next = after(function (err) {
        cb(err, ops)
      })

      // Delete the old refs for this osm document ID
      var refs = v.refs || row.value.refs || []
      var members = v.members || row.value.members || []
      row.links.forEach(function (link) {
        var done = next()
        self.log.get(link, function (err, node) {
          if (err) return done(err)
          var refs = (node.value.v ? node.value.v.refs : node.value.refs)
          var members = (node.value.v ? node.value.v.members : node.value.members)

          if (refs) {
            for (var i = 0; i < refs.length; i++) {
              var ref = refs[i]
              ops.push({ type: 'del', key: ref, rowKey: link })
              if (d) ops.push({ type: 'put', key: ref, value: d })
            }
          }
          if (members) {
            for (var i = 0; i < members.length; i++) {
              var member = members[i]
              if (typeof member === 'string') member = { ref: member }
              if (typeof member.ref !== 'string') return
              ops.push({ type: 'del', key: member.ref, rowKey: link })
              if (d) ops.push({ type: 'put', key: member.ref, value: d })
            }
          }
          done()
        })
      })

      // Write the new ref entries for this new osm document
      if (k) {
        for (var i = 0; i < refs.length; i++) {
          ops.push({ type: 'put', key: refs[i], value: k })
        }
        for (i = 0; i < members.length; i++) {
          ops.push({ type: 'put', key: members[i].ref || members[i], value: k })
        }
      }
    }
  })
  self.refs.on('error', function (err) { self.emit('error', err) })

  self.changeset = join({
    log: self.log,
    db: sub(self.db, 'c'),
    map: function (row, cb) {
      if (!row.value) return cb()
      var v = row.value.v
      if (!v || !v.changeset) return cb()
      return cb(null, { type: 'put', key: v.changeset, value: 0 })
    }
  })
  self.changeset.on('error', function (err) { self.emit('error', err) })
}

// Given the OsmVersion of a document, returns the OsmVersions of all documents
// that reference it (non-recursively).
// OsmVersion -> [OsmVersion]
DB.prototype._getReferers = function (version, cb) {
  var self = this
  self.log.get(version, function (err, doc) {
    if (err) return cb(err)
    self.refs.list(doc.value.k || doc.value.d, function (err, rows) {
      if (err) cb(err)
      else cb(null, rows.map(keyf))
    })
  })
  function keyf (row) { return row.key }
}

DB.prototype.ready = function (cb) {
  cb = once(cb || noop)
  var pending = 3
  this.refs.dex.ready(ready)
  this.kdb.ready(ready)
  this.changeset.dex.ready(ready)
  function ready () { if (--pending <= 0) cb() }
}

DB.prototype.create = function (value, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!cb) cb = noop
  var key = hex2dec(randomBytes(8).toString('hex'))
  self.put(key, value, opts, function (err, node) {
    cb(err, key, node)
  })
}

DB.prototype.put = function (key, value, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!cb) cb = noop
  self.lock(function (release) {
    self.kv.put(key, value, opts, function (err, node) {
      release(cb, err, node)
    })
  })
}

DB.prototype.del = function (key, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  cb = once(cb || noop)

  var rows = [
    {
      type: 'del',
      key: key,
      links: opts.links
    }
  ]

  self.batch(rows, opts, function (err, nodes) {
    if (err) cb(err)
    else cb(null, nodes[0])
  })
}

// OsmId, Opts -> [OsmBatchOp]
DB.prototype._getDocumentDeletionBatchOps = function (id, opts, cb) {
  var self = this

  if (!opts || !opts.links) {
    // Fetch all versions of the document ID
    self.kv.get(id, function (err, docs) {
      if (err) return cb(err)

      docs = mapObj(docs, function (version, doc) {
        if (doc.deleted) {
          return {
            id: id,
            version: version,
            deleted: true
          }
        } else {
          return doc.value
        }
      })

      handleLinks(docs)
    })
  } else {
    // Fetch all versions of documents that match 'opts.links`.
    mapLimit(opts.links, 10, linkToDocument, function (err, docList) {
      if (err) return cb(err)
      var docs = {}
      docList.forEach(function (doc) {
        docs[doc.version] = doc
      })
      handleLinks(docs)
    })
  }

  function linkToDocument (link, done) {
    self.log.get(link, function (err, node) {
      if (err) return done(err)

      done(null, node.value.d ? {
        id: node.value.d,
        version: node.key,
        deleted: true
      } : xtend(node.value.v, {
        id: node.value.k,
        version: node.key
      }))
    })
  }

  function handleLinks (docs) {
    var fields = {}
    var links = Object.keys(docs)
    links.forEach(function (ln) {
      var v = docs[ln] || {}
      if (v.lat !== undefined && v.lon !== undefined) {
        if (!fields.points) fields.points = []
        fields.points.push({ lat: v.lat, lon: v.lon })
      }
      if (Array.isArray(v.refs)) {
        if (!fields.refs) fields.refs = []
        fields.refs.push.apply(fields.refs, v.refs)
      }
      if (Array.isArray(v.members)) {
        if (!fields.members) fields.members = []
        fields.members.push.apply(fields.members, v.members)
      }
    })
    cb(null, [ { type: 'del', key: id, links: links, fields: fields } ])
  }
}

DB.prototype.batch = function (rows, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  cb = once(cb || noop)

  var batch = []
  self.lock(function (release) {
    var done = once(function () {
      self.kv.batch(batch, opts, function (err, nodes) {
        release(cb, err, nodes)
      })
    })

    var pending = 1 + rows.length
    rows.forEach(function (row) {
      var key = defined(row.key, row.id)
      if (!key) {
        key = row.key = hex2dec(randomBytes(8).toString('hex'))
      }

      if (row.links && !Array.isArray(row.links)) {
        return cb(new Error('row has a "links" field that isnt an array'))
      } else if (!row.links && row.links !== undefined) {
        return cb(new Error('row has a "links" field that is non-truthy but not undefined'))
      }

      if (row.type === 'put') {
        batch.push(row)
        if (--pending <= 0) done()
      } else if (row.type === 'del') {
        var xrow = xtend(opts, row)
        self._getDocumentDeletionBatchOps(key, xrow, function (err, xrows) {
          if (err) return release(cb, err)
          batch.push.apply(batch, xrows)
          if (--pending <= 0) done()
        })
      } else {
        var err = new Error('unexpected row type: ' + row.type)
        process.nextTick(function () { release(cb, err) })
      }
    })
    if (--pending <= 0) done()
  })
}

DB.prototype.get = function (key, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  this.kv.get(key, function (err, docs) {
    if (err) return cb(err)
    docs = mapObj(docs, function (version, doc) {
      if (doc.deleted) {
        return {
          id: key,
          version: version,
          deleted: true
        }
      } else {
        return doc.value
      }
    })

    cb(null, docs)
  })
}

// NOTE: doesn't do any deduplication; the caller is responsible for this
// TODO: memoized function for _getReferers
// TODO: memoized function for self.get(id)
DB.prototype._collectNodeAndReferers = function (version, lookupFn, cb) {
  var self = this

  collectBboxNode(version, cb)
  return

  // Collects a node that is within the query bounding box, as well as all ways
  // and relations that refer to it.
  // collectBboxNode :: OsmVersion -> [OsmElement]
  function collectBboxNode (version, cb) {
    lookupFn(version, function (err, pt) {
      if (err) return cb(err)

      var result = [pt]
      var pending = 2

      versionToRefererElements(version, function (err, elms) {
        if (err) return cb(err)
        pending--

        // If all referers are ways OR deleted, don't collect this bbox node.
        var allRefsDeleted = elms.length > 0 && elms.every(function (elm) {
          return elm.type !== 'way' || elm.deleted
        })
        if (allRefsDeleted) result.shift()

        elms.forEach(function (elm) {
          // Collect all ways referring to this node.
          if (elm.type === 'way') {
            pending++
            collectWay(elm.version, function (err, elms) {
              result.push.apply(result, elms)
              if (!--pending) cb(null, result)
            })
          }

          // XXX: Collect any deleted referrers just in case; right now we
          // don't know the type of deleted elements.
          if (elm.deleted) {
            console.log('foobar', elm)
            result.push(elm)
          }
        })
      })

      // Collect all relations referring to this node.
      collectRelationsOf(pt.version, function (err, elms) {
        result.push.apply(result, elms)
        if (!--pending) cb(null, result)
      })
    })
  }

  // Visits a way and all heads of its nodes. Includes the way in its results.
  // collectWay :: OsmVersion -> [OsmElement]
  function collectWay (version, cb) {
    lookupFn(version, function (err, elm) {
      if (err) cb(err)

      if (elm.deleted) {
        return cb(null, [elm])
      }

      var result = [elm]
      var pending = 2

      // Collect its nodes.
      mapLimit(elm.refs, 5, idToHeadElements, function (err, elmses) {
        var elms = flatten(elmses)
        result.push.apply(result, elms)
        if (!--pending) return cb(null, result)
      })

      // Collect all referers that are relations.
      console.log('way', elm)
      collectRelationsOf(version, function (err, elms) {
        console.log('way rels', elms)
        result.push.apply(result, elms)
        if (!--pending) return cb(null, result)
      })
    })
  }

  // Collect all relations referring to the element, recursively.
  // OsmVersion -> [OsmElement]
  function collectRelationsOf (version, cb) {
    versionToRefererElements(version, function (err, elms) {
      if (err) return cb(err)

      var result = elms.filter(function (elm) { return elm.type === 'relation' })
      var relationVersions = elms.map(function (elm) { return elm.version })

      mapLimit(relationVersions, 5, collectRelationsOf, function (err, elmses) {
        if (err) return cb(err)

        var elms = flatten(elmses)
        result.push.apply(result, elms)
        cb(null, result)
      })
    })
  }

  // OsmVersion -> [OsmElement]
  function versionToRefererElements (version, cb) {
    self._getReferers(version, function (err, versions) {
      if (err) return cb(err)
      mapLimit(versions, 5, lookupFn, cb)
    })
  }

  // Takes an OsmId, gets all heads for that OsmId, and returns their
  // OsmElements.
  // OsmId -> [OsmElement]
  function idToHeadElements (id, cb) {
    idToHeadVersions(id, function (err, versions) {
      mapLimit(versions, 5, lookupFn, cb)
    })
  }

  // OsmVersion -> [OsmVersion]
  function versionToHeadVersions (version, cb) {
    lookupFn(version, function (err, elm) {
      if (err) return cb(err)
      idToHeadVersions(elm.id, cb)
    })
  }

  // OsmId -> [OsmVersion]
  function idToHeadVersions (id, cb) {
    self.get(id, function (err, heads) {
      if (err) cb(err)
      else cb(null, Object.keys(heads))
    })
  }
}

// Given a node by its version, this collects the node itself, and also
// recursively climbs all ways and relations that the node (or its referers)
// are referred to by.
// OsmVersion, { OsmVersion: Boolean } -> [OsmDocument]
DB.prototype.__collectNodeAndReferers = function (version, seenAccum, cb) {
  cb = once(cb || noop)
  var self = this
  if (seenAccum[version]) return cb(null, [])
  var res = []
  var added = {}
  var pending = 1

  // Track the original node that came from the kdb query that brought us here,
  // but don't add it yet. There are certain conditions (e.g. there is only one
  // way containing us, and it's deleted) where the node would not be returned.
  var selfNode
  var originalNode
  self.log.get(version, function (err, node) {
    // TODO: handle error
    if (!err) {
      selfNode = node
      originalNode = node
    }
    self._getReferers(version, onLinks)
  })

  function onLinks (_, links) {
    if (!links) links = []

    // The original node has nothing referring to it, so it's a standalone node
    // on the map: add it.
    if (links.length === 0 && selfNode && !seenAccum[selfNode.key]) {
      addDocFromNode(selfNode)
      seenAccum[selfNode.key] = true
    }
    selfNode = null

    links.forEach(function (link) {
      if (seenAccum[link]) return
      seenAccum[link] = true
      pending++
      self.log.get(link, function (err, node) {
        // TODO: handle error
        if (!err) {
          addDocFromNode(node)
          if (node && node.value && node.value.k && node.value.v) {
            // Add the original node if a referer is a relation.
            // TODO: test this case (also where there are multiple refs that are all relations)
            if (originalNode && !seenAccum[originalNode.key] && node.value.v.type === 'relation') {
              addDocFromNode(originalNode)
              seenAccum[originalNode.key] = true
              originalNode = null
            }

            pending++
            self.get(node.value.k, function (err, docs) {
              if (err) return cb(err)
              Object.keys(docs).forEach(function (key) {
                addDoc(node.value.k, key, docs[key])
              })
              if (--pending <= 0) cb(null, res)
            })
          }
        }
        if (--pending <= 0) cb(null, res)
      })
      pending++
      self._getReferers(link, function (err, links2) {
        // TODO: handle error
        if (!err) {
          originalNode = null
          onLinks(err, links2)
        }
      })
    })

    if (--pending <= 0) cb(null, res)
  }

  function addDocFromNode (node) {
    if (node && node.value && node.value.k && node.value.v) {
      addDoc(node.value.k, node.key, node.value.v)
    } else if (node && node.value && node.value.d) {
      addDoc(node.value.d, node.key, {deleted: true})
    }
  }

  function addDoc (id, version, doc) {
    if (!added[version]) {
      doc = xtend(doc, {
        id: id,
        version: version
      })
      res.push(doc)
      added[version] = true
    }

    if (doc && Array.isArray(doc.refs || doc.nodes)) {
      addWayNodes(doc.refs || doc.nodes)
    }
  }

  function addWayNodes (refs) {
    refs.forEach(function (ref) {
      pending++
      self.get(ref, function (err, docs) {
        // TODO: handle error
        if (!err) {
          Object.keys(docs || {}).forEach(function (key) {
            if (seenAccum[key]) return
            seenAccum[key] = true
            addDoc(ref, key, docs[key])
          })
        }
        if (--pending <= 0) cb(null, res)
      })
    })
  }
}

DB.prototype.query = function (q, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  cb = once(cb || noop)

  // memoized node lookups by version
  // OsmVersion -> OsmElement
  var lookup = memoize(function(version, cb) {
    self.log.get(version, function (err, node) {
      if (err) return cb(err)
      cb(null, nodeToOsmElement(node))
    })
  })

  var res = []

  var done = once(function () {
    if (opts.order === 'type') {
      res.sort(cmpType)
    }
    cb(null, res)
  })

  self.ready(function () {
    self.kdb.query(q, opts, onquery)
  })

  function onquery (err, pts) {
    if (err) return cb(err)
    var pending = 1
    var seen = {}
    for (var i = 0; i < pts.length; i++) {
      var pt = pts[i]
      pending++
      self._collectNodeAndReferers(kdbPointToVersion(pt), lookup, function (err, r) {
        if (err) return cb(err)
        if (r) {
          for (var i=0; i < r.length; i++) {
            var elm = r[i]
            if (!seen[elm.version]) {
              seen[elm.version] = true
              res.push(elm)
            }
          }
        }
        if (--pending <= 0) done()
      })
    }
    if (--pending <= 0) done()
  }
}
var typeOrder = { node: 0, way: 1, relation: 2 }
function cmpType (a, b) {
  return typeOrder[a.type] - typeOrder[b.type]
}

DB.prototype.queryStream = function (q, opts) {
  var self = this

  // memoized node lookups by version
  // OsmVersion -> OsmElement
  var lookup = memoize(function(version, cb) {
    self.log.get(version, function (err, node) {
      if (err) return cb(err)
      cb(null, nodeToOsmElement(node))
    })
  })

  if (!opts) opts = {}
  var stream = opts.order === 'type'
    ? through.obj(writeType, endType)
    : through.obj(write)
  var queue = []
  var seen = {}
  self.ready(function () {
    var r = self.kdb.queryStream(q, opts)
    r.on('error', stream.emit.bind(stream, 'error'))
    r.pipe(stream)
  })
  return readonly(stream)

  function write (row, enc, next) {
    next = once(next)
    var tr = this
    self._collectNodeAndReferers(kdbPointToVersion(row), lookup, function (err, res) {
      if (err) return next()
      if (res) {
        res.forEach(function (r) {
          if (!seen[r.version]) tr.push(r)
          seen[r.version] = true
        })
      }
      next()
    })
  }
  function writeType (row, enc, next) {
    next = once(next)
    var tr = this
    self._collectNodeAndReferers(kdbPointToVersion(row), lookup, function (err, res) {
      if (err) return next()
      if (res) {
        res.forEach(function (r) {
          if (!seen[r.version]) {
            seen[r.version] = true
            if (r.type === 'node') tr.push(r)
            else queue.push(r)
          }
        })
      }
      next()
    })
  }
  function endType (next) {
    var tr = this
    queue.sort(cmpType).forEach(function (q) { tr.push(q) })
    next()
  }
}

DB.prototype.getChanges = function (key, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var r = this.changeset.list(key, opts)
  var stream = r.pipe(through.obj(write))
  if (cb) collectObj(stream, cb)
  return readonly(stream)

  function write (row, enc, next) {
    this.push(row.key)
    next()
  }
}

DB.prototype.close = function (cb) {
  this.db.close(onDone)
  this.log.db.close(onDone)
  this.store.close(onDone) // TODO: investigate fd-chunk-store (or deferred-chunk-store) not calling its cb on 'close'

  var pending = 3
  function onDone (err) {
    if (err) {
      pending = Infinity
      cb(err)
    } else if (--pending === 0) {
      cb()
    }
  }
}

function noop () {}

function collectObj (stream, cb) {
  cb = once(cb)
  var rows = []
  stream.on('error', cb)
  stream.pipe(to.obj(write, end))
  function write (x, enc, next) {
    rows.push(x)
    next()
  }
  function end () { cb(null, rows) }
}

// Object, (k, v -> v) -> Object
function mapObj (obj, fn) {
  Object.keys(obj).forEach(function (key) {
    obj[key] = fn(key, obj[key])
  })
  return obj
}

// KdbPoint -> OsmVersion
function kdbPointToVersion (pt) {
  return pt.value.toString('hex')
}

// {lat: Number, lon: Number} -> [Number, Number]
function ptf (x) {
  return [ Number(x.lat), Number(x.lon) ]
}

// [[x]] -> [x]
function flatten (listOfLists) {
  var res = []
  for (var i=0; i < listOfLists.length; i++) {
    var list = listOfLists[i]
    Array.prototype.push.apply(res, list)
  }
  return res
}

// HyperlogNode -> OsmElement
function nodeToOsmElement (node) {
  if (node && node.value && node.value.k && node.value.v) {
    return xtend(node.value.v, {
      id: node.value.k,
      version: node.key
    })
  } else if (node && node.value && node.value.d) {
    return {
      deleted: true,
      id: node.value.d,
      version: node.key
    }
  } else {
    throw new Error('invalid hyperlog node')
  }
}
