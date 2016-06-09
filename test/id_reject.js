var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile0 = path.join(tmpdir, 'osm-store-' + Math.random())
var storefile1 = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('reject id', function (t) {
  t.plan(17)
  var osm0 = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile0)
  })
  var osm1 = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile1),
    size: 4096
  })
  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { type: 'node', lat: 64.2, lon: -146.5 },
    D: { type: 'way', refs: [ 'A', 'B', 'C' ] }
  }
  var names = {}
  var nodes = {}
  var versions = {}

  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) return ready()
    var key = keys.shift()
    var doc = docs[key]
    if (doc.refs) {
      doc.refs = doc.refs.map(function (ref) { return names[ref] })
    }
    osm0.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      if (!versions[key]) versions[key] = []
      versions[key].push(node.key)
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    var pending = 2
    osm0.put('_id', 'log0', function (err, node) {
      t.error(err)
      versions.log0 = [node.key]
      if (--pending === 0) sync()
    })
    osm1.put('_id', 'log1', function (err, node) {
      t.error(err)
      versions.log0 = [node.key]
      if (--pending === 0) sync()
    })
  }
  function sync () {
    var r0 = osm0.replicate()
    var r1 = osm1.replicate()
    r0.pipe(r1).pipe(r0)
    r0.on('error', function (err) {
      t.ok(err, 'expected replication error')
      check()
    })
  }

  function check () {
    var q0 = [[63,65],[-148,-146]]
    osm1.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res, [])
    })
    var q1 = [[62,64],[-149.5,-146]]
    var ex1 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: names.A, version: versions.A[0] },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B[0] },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: names.C, version: versions.C[0] },
      { type: 'way', refs: [ names.A, names.B, names.C ],
        id: names.D, version: versions.D[0] }
    ].sort(idcmp)
    osm0.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'updated query 1')
    })
    osm1.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res, [])
    })
    osm0.get('_id', function (err, values) {
      t.error(err)
      var expected = {}
      expected[versions.log0] = 'log0'
      t.deepEqual(values, expected)
    })
    osm1.get('_id', function (err, values) {
      t.error(err)
      var expected = {}
      expected[versions.log0] = 'log0'
      t.deepEqual(values, expected)
    })
  }
})

function idcmp (a, b) {
  var aloc = a.lat + ',' + a.lon
  var bloc = b.lat + ',' + b.lon
  if (a.id === b.id) return aloc < bloc ? -1 : 1
  return a.id < b.id ? -1 : 1
}
