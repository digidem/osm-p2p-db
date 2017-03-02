var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')

var tmpdir = require('os').tmpdir()
var storefile0 = path.join(tmpdir, 'osm-store-' + Math.random())
var storefile1 = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('count forks', function (t) {
  t.plan(12)
  var osm0 = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile0)
  })
  var osm1 = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile1),
    size: 4096
  })
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
    if (keys.length === 0) return ready()
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
    var expected = {}
    expected[names.A] = 1
    expected[names.B] = 1
    expected[names.C] = 2
    expected[names.D] = 1
    osm0.kv.createReadStream({ values: false }).on('data', function (row) {
      t.equal(row.links.length, expected[row.key], 'expected fork count')
    })
    osm0.get(names.C, function (err, values) {
      t.ifError(err)
      var expected = {}
      expected[versions.C[1]] = { type: 'node', lat: 62.5, lon: -146.2 }
      expected[versions.C[2]] = { type: 'node', lat: 62.4, lon: -146.3 }
      t.deepEqual(values, expected, 'expected fork values')
    })
  }
})
