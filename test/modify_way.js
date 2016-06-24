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
  t.plan(8)
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
    { id: 'D', type: 'way', refs: [ 'A', 'E' ] }
  ]
  var names = {}
  var versions = {}

  ;(function next () {
    if (docs.length === 0) return ready()
    var doc = docs.shift()
    var key = doc.id
    delete doc.id
    osm.put(key, doc, function (err, node) {
      t.ifError(err)
      versions[key] = node.key
      next()
    })
  })()

  function ready () {
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: 'A', version: versions.A },
      { type: 'node', lat: 60.6, lon: -141.2,
        id: 'E', version: versions.E },
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, '')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
