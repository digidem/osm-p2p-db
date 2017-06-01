var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('delete a node from a way + modify way to remove node', function (t) {
  t.plan(19)
  var osm = makeOsm()
  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { type: 'node', lat: 64.2, lon: -146.5 },
    D: { type: 'node', lat: 64.123, lon: -147.56 },
    E: { type: 'way', refs: [ 'A', 'B', 'C', 'D' ] },
    F: { m: 'E', v: { type: 'way', refs: [ 'A', 'B', 'C' ] } },
    G: { d: 'D' }
  }
  var names = {}
  var nodes = {}
  var versions = {}

  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) return osm.ready(ready)
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
    } else if (doc.m) {
      doc.v.refs = doc.v.refs.map(function (ref) { return names[ref] })
      osm.put(names[doc.m], doc.v, function (err, node) {
        t.ifError(err)
        versions[key] = node.key
        nodes[names[doc.m]] = node
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
      { type: 'way', refs: [ names.A, names.B, names.C ],
        id: names.E, version: versions.F },
      { deleted: true, id: names.D, version: versions.G },
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
        id: names.A, version: versions.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: names.C, version: versions.C },
      { type: 'way', refs: [ names.A, names.B, names.C ],
        id: names.E, version: versions.F }
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

test('delete a node from a way', function (t) {
  t.plan(18)
  var osm = makeOsm()
  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { type: 'node', lat: 64.2, lon: -146.5 },
    D: { type: 'node', lat: 64.123, lon: -147.56 },
    E: { type: 'way', refs: [ 'A', 'B', 'C', 'D' ] },
    F: { d: 'D' }
  }
  var names = {}
  var nodes = {}
  var versions = {}

  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) return osm.ready(ready)
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
    } else if (doc.m) {
      doc.v.refs = doc.v.refs.map(function (ref) { return names[ref] })
      osm.put(names[doc.m], doc.v, function (err, node) {
        t.ifError(err)
        versions[key] = node.key
        nodes[names[doc.m]] = node
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
      { deleted: true, id: names.D, version: versions.F },
      { type: 'way', refs: [ names.A, names.B, names.C, names.D ],
        id: names.E, version: versions.E }
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
        id: names.A, version: versions.A },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B },
      { type: 'node', lat: 64.2, lon: -146.5,
        id: names.C, version: versions.C },
      { deleted: true, id: names.D, version: versions.F },
      { type: 'way', refs: [ names.A, names.B, names.C, names.D ],
        id: names.E, version: versions.E }
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
