var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('del relation', function (t) {
  t.plan(10)

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
    E: { type: 'relation', refs: [ 'A', 'B', 'D' ] },
    F: { d: 'E' }
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
    if (doc.d) {
      osm.del(names[doc.d], function (err, node) {
        t.ifError(err)
        versions[key] = node.key
        nodes[doc.d] = node
        next()
      })
    } else {
      osm.create(doc, function (err, k, node) {
        t.ifError(err)
        names[key] = k
        versions[key] = node.key
        nodes[k] = node
        next()
      })
    }
  })()

  function ready () {
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: names.A, version: versions.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: names.C, version: versions.C },
      { type: 'way', refs: [names.A, names.B, names.C],
        id: names.D, version: versions.D },
      { deleted: true, id: names.E, version: versions.F }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })
  }
})

test('del relation in relation', function (t) {
  t.plan(11)

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
    E: { type: 'relation', refs: [ 'A', 'B', 'D' ] },
    F: { type: 'relation', refs: [ 'A', 'E', 'D' ] },
    G: { d: 'F' },
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
    if (doc.d) {
      osm.del(names[doc.d], function (err, node) {
        t.ifError(err)
        versions[key] = node.key
        nodes[doc.d] = node
        next()
      })
    } else {
      osm.create(doc, function (err, k, node) {
        t.ifError(err)
        names[key] = k
        versions[key] = node.key
        nodes[k] = node
        next()
      })
    }
  })()

  function ready () {
    var q0 = [[63,65],[-148,-146]]
    var ex0 = [
      { type: 'node', lat: 64.5, lon: -147.3,
        id: names.A, version: versions.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: names.C, version: versions.C },
      { type: 'way', refs: [names.A, names.B, names.C],
        id: names.D, version: versions.D },
      { type: 'relation', refs: [names.A, names.B, names.D],
        id: names.E, version: versions.E },
      { deleted: true, id: names.F, version: versions.G }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
