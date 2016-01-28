var hyperkv = require('hyperkv')
var hyperkdb = require('hyperlog-kdb-index')
var kdbtree = require('kdb-tree-store')
var hindex = require('hyperlog-index')
var sub = require('subleveldown')
var randomBytes = require('randombytes')
var has = require('has')
var once = require('once')
var through = require('through2')
var readonly = require('read-only-stream')
var xtend = require('xtend')
var join = require('hyperlog-join')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter

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
  self.kdb = hyperkdb({
    log: self.log,
    store: opts.store,
    db: sub(self.db, 'kdb'),
    size: opts.store.chunkLength,
    kdbtree: kdbtree,
    types: [ 'float', 'float' ],
    map: function (row) {
      if (!row.value) return null
      var v = row.value.v, d = row.value.d
      if (v && v.lat !== undefined && v.lon !== undefined) {
        return { type: 'put', point: ptf(v) }
      } else if (d && Array.isArray(row.value.points)) {
        return { type: 'del', points: row.value.points.map(ptf) }
      }
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
      var refs = (v.refs || row.value.refs || [])
        .concat(v.members || row.value.members || [])
      var ops = []
      refs.forEach(function (ref) {
        row.links.forEach(function (link) {
          ops.push({ type: 'del', key: ref, rowKey: link })
        })
        if (k) ops.push({ type: 'put', key: ref, value: k })
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
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  if (!cb) cb = noop
  var key = randomBytes(8).toString('hex')
  return this.put(key, value, opts, function (err, node) {
    cb(err, key, node)
  })
}

DB.prototype.put = function (key, value, opts, cb) {
  this.kv.put(key, value, opts, cb)
}

DB.prototype.del = function (key, opts, cb) {
  var self = this
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  cb = once(cb || noop)
  self.kv.get(key, function (err, values) {
    var pending = 1
    var doc = { d: key }
    Object.keys(values).forEach(function (ln) {
      var v = values[ln] || {}
      if (v.lat !== undefined && v.lon !== undefined) {
        if (!doc.points) doc.points = []
        doc.points.push({ lat: v.lat, lon: v.lon })
      }
      if (Array.isArray(v.refs)) {
        if (!doc.refs) doc.refs = []
        doc.refs.push.apply(doc.refs, v.refs)
      }
    })
    self.log.add(Object.keys(values), doc, cb)
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
  self.ready(function () {
    self.kdb.query(q, opts, onquery)
  })
  function onquery (err, pts) {
    if (err) return cb(err)
    var pending = 1, res = [], seen = {}
    pts.forEach(function (pt) {
      pending++
      self._onpt(pt, seen, function (err, r) {
        if (r) res.push.apply(res, r)
        if (--pending === 0) cb(null, res)
      })
    })
    if (--pending === 0) cb(null, res)
  }
}

DB.prototype._onpt = function (pt, seen, cb) {
  var self = this
  var link = pt.value.toString('hex')
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
        if (--pending === 0) cb(null, res)
      })
      pending++
      self._links(link, function (err, links) {
        onlinks(err, links)
      })
    })
    if (--pending === 0) cb(null, res)
  })
}

DB.prototype.queryStream = function (q, opts) {
  var self = this
  var stream = through.obj(write)
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
    self._onpt(row, seen, function (err, res) {
      if (res) res.forEach(function (r) { tr.push(r) })
      next()
    })
  }
}

DB.prototype.getChanges = function (key, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  var r = this.changeset.list(key, opts)
  var rows = cb ? [] : null
  if (cb) cb = once(cb)
  var stream = r.pipe(through.obj(write, end))
  if (cb) r.once('error', cb)
  return readonly(stream)

  function write (row, enc, next) {
    if (rows) rows.push(row.key)
    this.push(row.key)
    next()
  }
  function end (next) {
    if (cb) cb(null, rows)
    next()
  }
}

function noop () {}
function notFound (err) {
  return /^notfound/i.test(err.message) || err.notFound
}
