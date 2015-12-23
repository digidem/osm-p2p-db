var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('update node', function (t) {
  t.plan(9)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile),
    size: 4096
  })
  var docs = {
    A: { type: 'node', loc: [ 64.5, -147.3 ] },
    B: { type: 'node', loc: [ 63.9, -147.6 ] },
    C: { type: 'node', loc: [ 64.2, -146.5 ] },
    D: { type: 'way', refs: [ 'A', 'B', 'C' ] }
  }
  var names = {}
  var nodes = {}

  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) return ready()
    var key = keys.shift()
    var doc = docs[key]
    if (doc.refs) {
      doc.refs = doc.refs.map(function (ref) { return names[ref] })
    }
    osm.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    var newdoc = { type: 'node', loc: [ 62.5, -146.2 ] }
    osm.put(names.C, newdoc, function (err) {
      t.ifError(err)
      check()
    })
  }

  function check () {
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', loc: [ 64.5, -147.3 ], id: names.A },
      { type: 'node', loc: [ 63.9, -147.6 ], id: names.B },
      { type: 'way', refs: [ names.A, names.B, names.C ], id: names.D }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'updated query 0')
    })
    var q1 = [[62,64],[-149.5,-146]]
    var ex1 = [
      { type: 'node', loc: [ 63.9, -147.6 ], id: names.B },
      { type: 'node', loc: [ 62.5, -146.2 ], id: names.C },
      { type: 'way', refs: [ names.A, names.B, names.C ], id: names.D }
    ].sort(idcmp)
    osm.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'updated query 1')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
