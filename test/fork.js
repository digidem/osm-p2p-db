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

test('fork', function (t) {
  t.plan(14)
  var osm0 = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile0),
    size: 4096
  })
  var osm1 = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile1),
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
    osm0.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    var r0 = osm0.log.replicate()
    var r1 = osm1.log.replicate()
    r0.pipe(r1).pipe(r0)
    r0.once('end', function () {
      var newdoc0 = { type: 'node', loc: [ 62.5, -146.2 ] }
      var newdoc1 = { type: 'node', loc: [ 62.4, -146.3 ] }
      osm0.put(names.C, newdoc0, function (err) {
        t.ifError(err)
        osm1.put(names.C, newdoc1, function (err) {
          t.ifError(err)
          replicate()
        })
      })
    })
  }

  function replicate () {
    var r0 = osm0.log.replicate()
    var r1 = osm1.log.replicate()
    r0.pipe(r1).pipe(r0)
    r0.once('end', function () {
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
    osm0.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'updated query 0')
    })
    osm1.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'updated query 0')
    })
    var q1 = [[62,64],[-149.5,-146]]
    var ex1 = [
      { type: 'node', loc: [ 63.9, -147.6 ], id: names.B },
      { type: 'node', loc: [ 62.5, -146.2 ], id: names.C },
      { type: 'node', loc: [ 62.4, -146.3 ], id: names.C },
      { type: 'way', refs: [ names.A, names.B, names.C ], id: names.D }
    ].sort(idcmp)
    osm0.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'updated query 1')
    })
    osm1.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'updated query 1')
    })
  }
})

function idcmp (a, b) {
  if (a.id === b.id) return a.loc.join(',') < b.loc.join(',') ? -1 : 1
  return a.id < b.id ? -1 : 1
}
