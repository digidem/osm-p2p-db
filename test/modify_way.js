var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('modify way', function (t) {
  t.plan(14)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
  var docs = [
    { id: 'A', type: 'node', lat: 64.5, lon: -147.3 },
    { id: 'B', type: 'node', lat: 63.9, lon: -147.6 },
    { id: 'C', type: 'node', lat: 64.2, lon: -146.5 },
    { id: 'D', type: 'way', refs: [ 'A', 'B', 'C' ] },
    { id: 'E', type: 'node', lat: 60.6, lon: -141.2 },
    { id: 'D', type: 'way', refs: [ 'A', 'E' ], links: ['D'] },
    { type: 'del', id: 'B', links: ['B'] },
    { type: 'del', id: 'C', links: ['C'] }
  ]
  var names = {}
  var versions = {}
  var deletions = {}

  ;(function next () {
    if (docs.length === 0) return ready()
    var doc = docs.shift()
    var key = doc.id
    delete doc.id
    var opts = {
      links: (doc.links || []).map(function (link) {
        return versions[link]
      })
    }
    delete doc.links
    if (doc.type === 'del') {
      osm.del(key, opts, function (err, node) {
        t.ifError(err)
        deletions[key] = node.key
        next()
      })
    } else {
      osm.put(key, doc, opts, function (err, node) {
        t.ifError(err)
        versions[key] = node.key
        next()
      })
    }
  })()

  function ready () {
    var q0 = [[59,61],[-144,-140]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 'A', version: versions.A },
      { type: 'node', lat: 60.6, lon: -141.2,
        id: 'E', version: versions.E },
      { type: 'way', refs: ['A','E'],
        id: 'D', version: versions.D },
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'query results: 0')
    })
    var q1 = [[64,65],[-148,-147]]
    var ex1 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 'A', version: versions.A },
      { type: 'node', lat: 60.6, lon: -141.2,
        id: 'E', version: versions.E },
      { type: 'way', refs: ['A','E'],
        id: 'D', version: versions.D },
    ].sort(idcmp)
    osm.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'query results: 1')
    })
    var q2 = [[60,66],[-150,-140]]
    var ex2 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 'A', version: versions.A },
      { type: 'node', lat: 60.6, lon: -141.2,
        id: 'E', version: versions.E },
      { type: 'way', refs: ['A','E'],
        id: 'D', version: versions.D },
      { deleted: true, id: 'B', version: deletions.B,
        lat: 63.9, lon: -147.6 },
      { deleted: true, id: 'C', version: deletions.C,
        lat: 64.2, lon: -146.5 },
    ].sort(idcmp)
    osm.query(q2, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex2, 'query results: 1')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
