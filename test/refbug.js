var test = require('tape')
var hyperlog = require('hyperlog')
var memdb = require('memdb')
var path = require('path')
var fdstore = require('fd-chunk-store')
var data = require('./data/refbug.json')
var osmdb = require('../')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

test('refbug', function (t) {
  t.plan(data.length + 5)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
  var nodes = [], docs = {}, deletions = {}
  ;(function next () {
    if (data.length === 0) return ready()
    var row = data.shift()
    var prev = docs[row.key]
    var p = prev && prev[prev.length-1]
    var links = p ? [p] : []
    if (row.type === 'del') {
      osm.del(row.key, { links: links }, function (err, node) {
        t.error(err)
        deletions[row.key] = node.key
        next()
      })
    } else {
      osm.put(row.key, row.value, { links: links }, function (err, node) {
        t.error(err)
        nodes.push(node)
        if (!docs[row.key]) docs[row.key] = []
        docs[row.key].push(node.key)
        next()
      })
    }
  })()

  function ready () {
    var bbox = [[64,66],[-149,-146]]
    osm.query(bbox, function (err, res) {
      t.error(err)
      t.equal(res.length, 3)
      var node1 = res.filter(eqtype('node'))[0]
      var node2 = res.filter(function (doc) { return doc.deleted })[0]
      var way = res.filter(eqtype('way'))[0]
      t.deepEqual(node1, {
        type: 'node',
        id: 'n1',
        lat: 64.9,
        lon: -147.9,
        version: nodes[nodes.length-2].key
      })
      t.deepEqual(node2, {
        id: 'n2',
        lat: 64.6,
        lon: -147.8,
        deleted: true,
        id: 'n2',
        version: deletions['n2']
      })
      t.deepEqual(way, {
        type: 'way',
        id: 'w1',
        refs: [ 'n1' ],
        version: nodes[nodes.length-1].key
      })
    })
  }
})

test('refbug 2: nodes referred to by old versions of a way are retained', function (t) {
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })

  var batch = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 1.0, lon: 2.0 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 3.0, lon: 4.0 } },
    { type: 'put', key: 'D', value: { type: 'node', lat: 64.123, lon: -147.56 } },
    { type: 'put', key: 'F', value: { type: 'way', refs: [ 'A', 'B' ] } }
  ]
  var versions = {}
  var way

  osm.batch(batch, function (err, nodes) {
    t.error(err)
    nodes.forEach(function (node) {
      versions[node.value.k] = node.key
    })
    way = versions.F
    osm.ready(ready)
  })

  var pending = 4
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [way], 'A referenced by original way')
      done()
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [way], 'B referenced by original way')
      done()
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No ways should reference C')
      done()
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No ways should reference D')
      done()
    })
  }

  function done () {
    if (--pending === 0) {
      nextStep()
    }
  }

  function nextStep () {
    // modify original way
    var way1 = { type: 'way', refs: [ 'A', 'C' ] }
    osm.put('F', way1, {links: [versions.F]}, function (err, doc) {
      t.error(err)
      osm.ready(ready)
    })
    function ready () {
      osm.refs.list('B', function (err, refs) {
        t.error(err)
        t.deepEqual(refs.map(mapKeys), [], 'B no longer referenced')
        t.end()
      })
    }
  }
})

test('refbug 2: ways referred to by old versions of a relation are retained', function (t) {
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })

  var batch = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 1.0, lon: 2.0 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 3.0, lon: 4.0 } },
    { type: 'put', key: 'D', value: { type: 'node', lat: 64.123, lon: -147.56 } },
    { type: 'put', key: 'E', value: {
      type: 'relation', members: [
        { type: 'node', ref: 'A' },
        { type: 'node', ref: 'B' }
      ] }
    }
  ]
  var versions = {}
  var rel

  osm.batch(batch, function (err, nodes) {
    t.error(err)
    nodes.forEach(function (node) {
      versions[node.value.k] = node.key
    })
    rel = versions.E
    osm.ready(ready)
  })

  var pending = 4
  function ready () {
    osm.refs.list('A', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [rel], 'A referenced by original relation')
      done()
    })
    osm.refs.list('B', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [rel], 'B referenced by original relation')
      done()
    })
    osm.refs.list('C', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No relations should reference C')
      done()
    })
    osm.refs.list('D', function (err, refs) {
      t.error(err)
      t.deepEqual(refs.map(mapKeys), [], 'No relations should reference D')
      done()
    })
  }

  function done () {
    if (--pending === 0) {
      nextStep()
    }
  }

  function nextStep () {
    // modify original way
    var rel1 = { type: 'relation', members: [
        { type: 'node', ref: 'A' },
        { type: 'node', ref: 'C' }
      ] }
    osm.put('E', rel1, {links: [versions.E]}, function (err, doc) {
      t.error(err)
      osm.ready(ready)
    })
    function ready () {
      osm.refs.list('B', function (err, refs) {
        t.error(err)
        t.deepEqual(refs.map(mapKeys), [], 'B no longer referenced')
        t.end()
      })
    }
  }
})

function eqtype (t) {
  return function (node) { return node.type === t }
}

function mapKeys (ref) {
  return ref.key
}
