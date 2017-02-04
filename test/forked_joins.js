var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')
var versions = {}
var ways = []
var osm = osmdb({
  log: hyperlog(memdb(), { valueEncoding: 'json' }),
  db: memdb(),
  store: fdstore(4096, storefile)
})

test('setup db', function (t) {
  t.plan(9)
  var batch = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 1.0, lon: 2.0 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 3.0, lon: 4.0 } },
    { type: 'put', key: 'D', value: { type: 'node', lat: 64.123, lon: -147.56 } },
    { type: 'put', key: 'F', value: { type: 'way', refs: [ 'A', 'B' ] } }
  ]
  osm.batch(batch, function (err, nodes) {
    t.error(err)
    nodes.forEach(function (node) {
      versions[node.value.k] = node.key
    })
    ways[0] = versions.F
    console.log('way0 version:', ways[0])
    ready()
  })
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[0]], 'A referenced by original way')
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[0]], 'B referenced by original way')
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No ways should reference C')
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No ways should reference D')
    })
  }
})

test('modify way', function (t) {
  t.plan(9)
  // modify original way
  var way1 = { type: 'way', refs: [ 'A', 'C' ] }
  osm.put('F', way1, {links: [versions.F]}, function (err, doc) {
    t.error(err)
    ways[1] = doc.key
    console.log('way1 version:', ways[1])
    ready()
  })
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[1]], 'A referenced by way1')
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'B no longer referenced')
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[1]], 'C referenced by way1')
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No ways should reference D')
    })
  }
})

test('fork way', function (t) {
  t.plan(9)
  // create fork of original way
  var way2 = { type: 'way', refs: [ 'A', 'D' ] }
  osm.put('F', way2, {links: [versions.F]}, function (err, doc) {
    ways[2] = doc.key
    console.log('way2 version:', ways[2])
    t.error(err)
    ready()
  })
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.deepEqual([ways[1], ways[2]].sort(), refs.map(mapKeys).sort(), 'A referenced by way1 and way2')
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'B no longer referenced')
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[1]], 'C referenced by way1')
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[2]], 'D referenced by way2')
    })
  }
})

test('delete a fork', function (t) {
  t.plan(9)
  // Delete first fork
  osm.del('F', {keys: [ways[1]]}, function (err, doc) {
    t.error(err)
    ready()
  })
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.equal(refs.length, 1, 'A referenced by a single way')
      t.deepEqual(refs.map(mapKeys), [ways[2]], 'A referenced by way2')
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'B no longer referenced')
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'C no longer referenced')
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [ways[2]], 'D referenced by way2')
    })
  }
})

test('delete way completely', function (t) {
  t.plan(9)
  osm.del('F', function (err, doc) {
    t.error(err)
    ready()
  })
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'A no longer referenced')
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'B no longer referenced')
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'C no longer referenced')
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'D no longer referenced')
    })
  }
})

function mapKeys (ref) {
  return ref.key
}

