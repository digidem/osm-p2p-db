var hyperkv = require('hyperkv')
var hyperkdb = require('hyperlog-kdb-index')
var kdbtree = require('kdb-tree-store')
var hindex = require('hyperlog-index')
var sub = require('subleveldown')
var randomBytes = require('randombytes')
var has = require('has')
var once = require('once')

module.exports = DB

function DB (opts) {
  var self = this
  if (!(self instanceof DB)) return new DB(opts)
  self.log = opts.log
  self.db = opts.db
  self.kv = hyperkv({
    log: self.log,
    db: sub(self.db, 'kv')
  })
  self.kdb = hyperkdb({
    log: self.log,
    store: opts.store,
    db: sub(self.db, 'kdb'),
    size: opts.size || opts.store.size,
    kdbtree: kdbtree,
    types: [ 'float', 'float' ],
    map: function (row) {
      if (row.value && Array.isArray(row.value.loc)) {
        return row.value.loc
      }
    }
  })
  self.refdb = sub(self.db, 'rx', { valueEncoding: 'json' })
  self.refdex = hindex(self.log, sub(self.db, 'ri'), function (row, next) {
    next = once(next)
    if (!row.value || !row.value.v) return next()
    var k = row.value.k, v = row.value.v
    var refs = (v.refs || []).concat(v.members || [])
    var batch = [], pending = 1

    refs.forEach(function (ref) {
      pending++
      self.refdb.get(ref, function (err, links) {
        if (err) return next(err)
        var ln = {}
        links.forEach(function (link) { ln[link] = true })
        row.links.forEach(function (link) { delete ln[link] })
        batch.push({ type: 'put', key: ref, value: Object.keys(ln) })
        if (--pending === 0) insert()
      })
      if (--pending === 0) insert()
    })

    function insert () {
      self.refdb.batch(batch, next)
    }
  })
}

DB.prototype.create = function (value, opts, cb) {
  var key = randomBytes(8).toString('hex')
  return this.put(key, value, opts, function (err) {
    cb(err, key)
  })
}

DB.prototype.put = function (key, value, opts, cb) {
  this.kv.put(key, value, opts, cb)
}

DB.prototype.get = function (key, opts, cb) {
  this.kv.get(key, opts, cb)
}

DB.prototype.query = function (q, opts, cb) {
  this.kdb.query(q, opts, cb)
}

DB.prototype.queryStream = function (q, opts) {
  return this.kdb.queryStream(q, opts)
}
