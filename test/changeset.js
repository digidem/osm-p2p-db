var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('changeset', function (t) {
  t.plan(16)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile),
    size: 4096
  })
  var docs = {
    A: { type: 'changeset', tags: { comment: 'whatever' } },
    B: { type: 'node', lat: 64.5, lon: -147.3, changeset: 'A' },
    C: { type: 'node', lat: 63.9, lon: -147.6, changeset: 'A' },
    D: { type: 'node', lat: 64.2, lon: -146.5, changeset: 'A' },
    E: { type: 'way', refs: [ 'B', 'C', 'D' ], changeset: 'A' }
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
    if (doc.changeset) {
      doc.changeset = names[doc.changeset]
    }
    osm.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      versions[key] = node.key
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: names.B, version: versions.B, changeset: names.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.C, version: versions.C, changeset: names.A },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: names.D, version: versions.D, changeset: names.A },
      { type: 'way', refs: [ names.B, names.C, names.D ],
        id: names.E, version: versions.E, changeset: names.A }
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
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.C, version: versions.C, changeset: names.A },
      { type: 'way', refs: [ names.B, names.C, names.D ],
        id: names.E, version: versions.E, changeset: names.A }
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
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
