var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()

var osmdb = require('../')

test('relation of ways', function (t) {
  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { type: 'node', lat: 64.2, lon: -146.5 },
    D: { type: 'way', refs: [ 'A', 'B', 'C' ] },
    E: { type: 'node', lat: 62.1, lon: -145.1 },
    F: { type: 'node', lat: 62.3, lon: -146.4 },
    G: { type: 'node', lat: 62.6, lon: -146.0 },
    H: { type: 'way', refs: [ 'E', 'F', 'G' ] },
    I: { type: 'relation', members: [
      { type: 'way', ref: 'D' },
      { type: 'way', ref: 'H' },
      { type: 'node', ref: 'G' }
    ] }
  }
  var keys = Object.keys(docs).sort()
  t.plan(keys.length + 4)

  var storefile = path.join(tmpdir, 'osm-store-' + Math.random())
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
  var names = {}
  var nodes = {}
  var versions = {}

  ;(function next () {
    if (keys.length === 0) return ready()
    var key = keys.shift()
    var doc = docs[key]
    if (doc.refs) {
      doc.refs = doc.refs.map(function (ref) { return names[ref] })
    }
    ;(doc.members || []).forEach(function (m) {
      if (m.ref) m.ref = names[m.ref]
    })
    osm.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      versions[key] = node.key
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    var q0 = [[62,63],[-145.5,-144.5]]
    var ex0 = [
      { type: 'node', lat: 62.1, lon: -145.1,
        id: names.E, version: versions.E },
      { type: 'node', lat: 62.3, lon: -146.4,
        id: names.F, version: versions.F },
      { type: 'node', lat: 62.6, lon: -146.0,
        id: names.G, version: versions.G },
      { type: 'way', refs: [ names.E, names.F, names.G ],
        id: names.H, version: versions.H },
      { type: 'relation',
        members: [
          { type: 'way', ref: names.D },
          { type: 'way', ref: names.H },
          { type: 'node', ref: names.G }
        ],
        id: names.I, version: versions.I }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'relation of ways')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'relation of ways stream')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
