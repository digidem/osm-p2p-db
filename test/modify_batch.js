var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()

var osmdb = require('../')

test('del batch', function (t) {
  t.plan(14)

  var storefile = path.join(tmpdir, 'osm-store-' + Math.random())
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })

  var batch0 = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 1.0, lon: 2.0 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 3.0, lon: 4.0 } },
    { type: 'put', key: 'D', value: { type: 'node', lat: 64.123, lon: -147.56 } },
    { type: 'put', key: 'F', value: { type: 'way', refs: [ 'A', 'B', 'C' ] } }
  ]
  var batch1 = [
    { type: 'put', key: 'B', value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'del', key: 'D' }
  ]
  var versions = {}
  osm.batch(batch0, function (err, nodes) {
    t.error(err)
    nodes.forEach(function (node) {
      versions[node.value.k] = node.key
    })
    osm.batch(batch1, function (err, nodes) {
      t.error(err)
      nodes.forEach(function (node) {
        versions[node.value.k || node.value.d] = node.key
      })
      ready()
    })
  })
  function ready () {
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 'A', version: versions.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: 'B', version: versions.B },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: 'C', version: versions.C },
      { deleted: true, id: 'D', version: versions.D },
      { type: 'way', refs: [ 'A', 'B', 'C' ],
        id: 'F', version: versions.F }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })
    var q1 = [[62,64],[-149.5,-147.5]]
    var ex1 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 'A', version: versions.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: 'B', version: versions.B },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: 'C', version: versions.C },
      { type: 'way', refs: [ 'A', 'B', 'C' ],
        id: 'F', version: versions.F }
    ].sort(idcmp)
    osm.query(q1, function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage query')
    })
    collect(osm.queryStream(q1), function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage stream')
    })
    var q2 = [[62,64],[-147,-145]]
    var ex2 = []
    osm.query(q2, function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage query')
    })
    collect(osm.queryStream(q2), function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage stream')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
