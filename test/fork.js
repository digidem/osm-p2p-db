var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('fork', function (t) {
  t.plan(14)
  var osm0 = makeOsm()
  var osm1 = makeOsm()
  var docs = {
    A: { type: 'node', lat: 64.5, lon: -147.3 },
    B: { type: 'node', lat: 63.9, lon: -147.6 },
    C: { type: 'node', lat: 64.2, lon: -146.5 },
    D: { type: 'way', refs: [ 'A', 'B', 'C' ] }
  }
  var names = {}
  var nodes = {}
  var versions = {}

  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) return osm0.ready(function () { osm1.ready(ready) })
    var key = keys.shift()
    var doc = docs[key]
    if (doc.refs) {
      doc.refs = doc.refs.map(function (ref) { return names[ref] })
    }
    osm0.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      if (!versions[key]) versions[key] = []
      versions[key].push(node.key)
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    var r0 = osm0.log.replicate()
    var r1 = osm1.log.replicate()
    r0.pipe(r1).pipe(r0)
    r0.once('end', function () {
      var newdoc0 = { type: 'node', lat: 62.5, lon: -146.2 }
      var newdoc1 = { type: 'node', lat: 62.4, lon: -146.3 }
      osm0.put(names.C, newdoc0, function (err, node) {
        t.ifError(err)
        versions.C.push(node.key)

        osm1.put(names.C, newdoc1, function (err, node) {
          t.ifError(err)
          versions.C.push(node.key)
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
      { type: 'node', lat: 64.5, lon: -147.3,
        id: names.A, version: versions.A[0] },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B[0] },
      { type: 'node', lat: 62.5, lon: -146.2,
        id: names.C, version: versions.C[1] },
      { type: 'node', lat: 62.4, lon: -146.3,
        id: names.C, version: versions.C[2] },
      { type: 'way', refs: [ names.A, names.B, names.C ],
        id: names.D, version: versions.D[0] }
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
      { type: 'node', lat: 64.5, lon: -147.3,
        id: names.A, version: versions.A[0] },
      { type: 'node', lat: 63.9, lon: -147.6,
        id: names.B, version: versions.B[0] },
      { type: 'node', lat: 62.5, lon: -146.2,
        id: names.C, version: versions.C[1] },
      { type: 'node', lat: 62.4, lon: -146.3,
        id: names.C, version: versions.C[2] },
      { type: 'way', refs: [ names.A, names.B, names.C ],
        id: names.D, version: versions.D[0] }
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
  var aloc = a.lat + ',' + a.lon
  var bloc = b.lat + ',' + b.lon
  if (a.id === b.id) return aloc < bloc ? -1 : 1
  return a.id < b.id ? -1 : 1
}
