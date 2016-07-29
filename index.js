var hyperkv = require('hyperkv')
var hyperkdb = require('hyperlog-kdb-index')
var kdbtree = require('kdb-tree-store')
var sub = require('subleveldown')
var randomBytes = require('randombytes')
var has = require('has')
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

module.exports = DB
inherits(DB, EventEmitter)

function DB (opts) {
  var self = this
  if (!(self instanceof DB)) return new DB(opts)
  self.log = opts.log
  self.db = opts.db
  self.kv = hyperkv({
    log: self.log,
    db: sub(self.db, 'kv')
  })
  self.kv.on('error', function (err) { self.emit('error', err) })
  self.lock = lock()
  self.kdb = hyperkdb({
    log: self.log,
    store: opts.store,
    db: sub(self.db, 'kdb'),
    kdbtree: kdbtree,
    types: [ 'float', 'float' ],
    map: function (row, next) {
      if (!row.value) return null
      var v = row.value.v, d = row.value.d
      if (v && v.lat !== undefined && v.lon !== undefined) {
        next(null, { type: 'put', point: ptf(v) })
      } else if (d && Array.isArray(row.value.points)) {
        next(null, { type: 'del', points: row.value.points.map(ptf) })
      } else next()
      function ptf (x) { return [ x.lat, x.lon ] }
    }
  })
  self.kdb.on('error', function (err) { self.emit('error', err) })
  self.refs = join({
    log: self.log,
    db: sub(self.db, 'r'),
    map: function (row) {
      if (!row.value) return
      var k = row.value.k, v = row.value.v || {}
      var ops = []
      var refs = v.refs || row.value.refs || []
      refs.forEach(function (ref) {
        row.links.forEach(function (link) {
          ops.push({ type: 'del', key: ref, rowKey: link })
        })
        if (k) ops.push({ type: 'put', key: ref, value: k })
      })
      var members = v.members || row.value.members || []
      members.forEach(function (member) {
        if (typeof member === 'string') member = { ref: member }
        if (typeof member.ref !== 'string') return
        row.links.forEach(function (link) {
          ops.push({ type: 'del', key: member.ref, rowKey: link })
        })
        if (k) ops.push({ type: 'put', key: member.ref, value: k })
      })
      return ops
    }
  })
  self.refs.on('error', function (err) { self.emit('error', err) })
  self.changeset = join({
    log: self.log,
    db: sub(self.db, 'c'),
    map: function (row) {
      if (!row.value) return
      var v = row.value.v
      if (!v || !v.changeset) return
      return { type: 'put', key: v.changeset, value: 0 }
    }
  })
  self.changeset.on('error', function (err) { self.emit('error', err) })
}

DB.prototype._links = function (link, cb) {
  var self = this
  self.log.get(link, function (err, doc) {
    if (err) return cb(err)
    self.refs.list(doc.value.k, function (err, rows) {
      if (err) cb(err)
      else cb(null, rows.map(keyf))
    })
  })
  function keyf (row) { return row.key }
}

DB.prototype.ready = function (cb) {
  var self = this
  var pending = 2
  self.refs.dex.ready(ready)
  self.kdb.ready(ready)
  function ready () { if (--pending === 0) cb() }
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
  self._del(key, opts, function (err, rows) {
    if (err) return cb(err)
    self.batch(rows, opts, function (err, nodes) {
      if (err) cb(err)
      else cb(null, nodes[0])
    })
  })
}

DB.prototype._del = function (key, opts, cb) {
  var self = this
  self.kv.get(key, function (err, values) {
    if (err) return cb(err)
    var pending = 1
    var fields = {}
    var links = opts.keys || Object.keys(values)
    links.forEach(function (ln) {
      var v = values[ln] || {}
      if (v.lat !== undefined && v.lon !== undefined) {
        if (!fields.points) fields.points = []
        fields.points.push({ lat: v.lat, lon: v.lon })
      }
      if (Array.isArray(v.refs)) {
        if (!fields.refs) fields.refs = []
        fields.refs.push.apply(fields.refs, v.refs)
      }
    })
    cb(null, [ { type: 'del', key: key, links: links, fields: fields } ])
  })
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
    var pending = 1 + rows.length
    rows.forEach(function (row) {
      var key = defined(row.key, row.id)
      if (row.type === 'put') {
        batch.push(row)
        if (--pending === 0) done()
      } else if (row.type === 'del') {
        self._del(key, xtend(opts, row), function (err, xrows) {
          if (err) return release(cb, err)
          batch.push.apply(batch, xrows)
          if (--pending === 0) done()
        })
      } else {
        var err = new Error('unexpected row type: ' + row.type)
        process.nextTick(function () { release(cb, err) })
      }
    })
    if (--pending === 0) done()

    function done () {
      self.kv.batch(batch, opts, function (err, nodes) {
        release(cb, err, nodes)
      })
    }
  })
}

DB.prototype.get = function (key, opts, cb) {
  this.kv.get(key, opts, function (err, doc) {
    if (err) return cb(err)
    else if (doc.type === 'changeset') {
      //...
    } else cb(null, doc)
  })
}

DB.prototype.query = function (q, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  cb = once(cb || noop)
  var res = []
  self.ready(function () {
    self.kdb.query(q, opts, onquery)
  })
  function onquery (err, pts) {
    if (err) return cb(err)
    var pending = 1, seen = {}
    pts.forEach(function (pt) {
      pending++
      self._onpt(pt, seen, function (err, r) {
        if (r) res = res.concat(r)
        if (--pending === 0) done()
      })
    })
    if (--pending === 0) done()
  }
  function done () {
    if (opts.order === 'type') {
      res.sort(cmpType)
    }
    cb(null, res)
  }
}
var typeOrder = { node: 0, way: 1, relation: 2 }
function cmpType (a, b) {
  return typeOrder[a.type] - typeOrder[b.type]
}

DB.prototype._onpt = function (pt, seen, cb) {
  var self = this
  var link = pt.value.toString('hex')
  if (has(seen, link)) return cb(null, [])
  seen[link] = true
  var res = [], pending = 2
  self.log.get(link, function (err, doc) {
    if (doc && doc.value && doc.value.k && doc.value.v) {
      res.push(xtend(doc.value.v, {
        id: doc.value.k,
        version: doc.key
      }))
    }
    if (--pending === 0) cb(null, res)
  })
  self._links(link, function onlinks (err, links) {
    if (!links) links = []
    links.forEach(function (link) {
      if (has(seen, link)) return
      seen[link] = true
      pending++
      self.log.get(link, function (err, doc) {
        if (doc && doc.value && doc.value.k && doc.value.v) {
          res.push(xtend(doc.value.v, {
            id: doc.value.k,
            version: doc.key
          }))
        }
        if (doc && doc.value && doc.value.k && doc.value.v
        && doc.value.v.type === 'way' && Array.isArray(doc.value.v.refs)) {
          addWayNodes(doc.value.v.refs)
        } else if (--pending === 0) cb(null, res)
      })
      pending++
      self._links(link, function (err, links) {
        onlinks(err, links)
      })
    })
    if (--pending === 0) cb(null, res)
  })

  function addWayNodes (refs) {
    refs.forEach(function (ref) {
      if (has(seen, ref)) return
      seen[ref] = true
      pending++
      self.get(ref, function (err, docs) {
        Object.keys(docs || {}).forEach(function (key) {
          if (has(seen, key)) return
          seen[key] = true
          res.push(xtend(docs[key], {
            id: ref,
            version: key
          }))
        })
        if (--pending === 0) cb(null, res)
      })
    })
    if (--pending === 0) cb(null, res)
  }
}

DB.prototype.queryStream = function (q, opts) {
  var self = this
  if (!opts) opts = {}
  var stream = opts.order === 'type'
    ? through.obj(writeType, endType)
    : through.obj(write)
  var seen = {}, queue = [], prev
  self.ready(function () {
    var r = self.kdb.queryStream(q, opts)
    r.on('error', stream.emit.bind(stream, 'error'))
    r.pipe(stream)
  })
  return readonly(stream)

  function write (row, enc, next) {
    next = once(next)
    var tr = this
    self._onpt(row, seen, function (err, res) {
      if (res) res.forEach(function (r) {
        tr.push(r)
      })
      next()
    })
  }
  function writeType (row, enc, next) {
    next = once(next)
    var tr = this
    self._onpt(row, seen, function (err, res) {
      if (res) res.forEach(function (r) {
        if (!prev || typeOrder[prev.type] >= typeOrder[r.type]) {
          while (queue.length > 0) {
            if (typeOrder[queue[0].type] <= typeOrder[r.type]) {
              tr.push(queue.shift())
            } else break
          }
          tr.push(r)
          prev = r
        } else {
          insert(r)
        }
      })
      next()
    })
  }
  function endType (next) {
    var tr = this
    queue.forEach(function (q) { tr.push(q) })
    next()
  }
  function insert (r) {
    for (var i = 0; i < queue.length; i++ ) {
      if (typeOrder[r.type] >= typeOrder[queue[i].type]) {
        return queue.splice(i,0,r)
      }
    }
    queue.push(r)
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
