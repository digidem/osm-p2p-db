var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')
var osmSetup = require('./osm-setup')

var tmpdir = require('os').tmpdir()

var osmdb = require('../')

test('del node', function (t) {
  t.plan(5)

  var storefile = path.join(tmpdir, 'osm-store-' + Math.random())
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })

  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { d: 'A' }
  }

  osmSetup(osm, docs, function (err, nodes, versions, names) {
    t.ifError(err)

    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 63.9, lon: -147.6, id: names.B, version: versions.B },
      { deleted: true, id: names.A, version: versions.C },
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })
  })
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
