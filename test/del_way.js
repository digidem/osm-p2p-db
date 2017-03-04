var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')
var osmSetup = require('./osm-setup')

var tmpdir = require('os').tmpdir()

var osmdb = require('../')

test('del way', function (t) {
  t.plan(9)

  var storefile = path.join(tmpdir, 'osm-store-' + Math.random())
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })

  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { type: 'node', lat: 64.2, lon: -146.5 },
    D: { type: 'way', refs: [ 'A', 'B', 'C' ] },
    E: { d: 'D' }
  }

  osmSetup(osm, docs, function (err, nodes, versions, names) {
    t.ifError(err)

    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { deleted: true, id: names.D, version: versions.E }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })

    var q1 = [[63,64],[-148,-146]]
    var ex1 = [
      { deleted: true, id: names.D, version: versions.E }
    ].sort(idcmp)
    osm.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage query')
    })
    collect(osm.queryStream(q1), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage stream')
    })
  })
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
