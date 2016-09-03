var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('create 3 nodes and a way', function (t) {
  t.plan(13)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
  var rows = [
    { type: 'put', key: 1, value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 2, value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 3, value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'put', key: 4, value: { type: 'way', refs: [ 1, 2, 3 ] } }
  ]
  osm.batch(rows, function (err, nodes) {
    t.error(err)
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 1, version: nodes[0].key },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: 2, version: nodes[1].key },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: 3, version: nodes[2].key },
      { type: 'way', refs: [ 1, 2, 3 ],
        id: 4, version: nodes[3].key }
    ].sort(idcmp)

    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })
    var q1 = [[62,64],[-149.5,-147.5]]
    var ex1 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 1, version: nodes[0].key },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: 2, version: nodes[1].key },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: 3, version: nodes[2].key },
      { type: 'way', refs: [ 1, 2, 3 ],
        id: 4, version: nodes[3].key }
    ].sort(idcmp)
    osm.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage query')
    })
    collect(osm.queryStream(q1), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage stream')
    })
    var q2 = [[62,64],[-147,-145]]
    var ex2 = []
    osm.query(q2, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage query')
    })
    collect(osm.queryStream(q2), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage stream')
    })
  })
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
