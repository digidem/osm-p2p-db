var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('del batch', function (t) {
  t.plan(14)
  var osm = makeOsm()
  var batch0 = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'put', key: 'D', value: { type: 'node', lat: 64.123, lon: -147.56 } },
    { type: 'put', key: 'E', value: { type: 'way', refs: [ 'A', 'B' ] } },
    { type: 'put', key: 'F', value: { type: 'way', refs: [ 'A', 'B', 'C' ] } }
  ]
  var batch1 = [
    { type: 'del', key: 'E' },
    { type: 'del', key: 'D' }
  ]
  var versions = {}
  var deletions = {}
  osm.batch(batch0, function (err, nodes) {
    t.error(err)
    nodes.forEach(function (node) {
      versions[node.value.k] = node.key
    })
    osm.batch(batch1, function (err, nodes) {
      t.error(err)
      nodes.forEach(function (node) {
        deletions[node.value.d] = node.key
      })
      osm.ready(ready)
    })
  })
  function ready () {
    var q0 = [[63, 65], [-148, -146]]
    var ex0 = [
      { type: 'node',
        lat: 64.5,
        lon: -147.3,
        id: 'A',
        version: versions.A },
      { type: 'node',
        lat: 63.9,
        lon: -147.6,
        id: 'B',
        version: versions.B },
      { type: 'node',
        lat: 64.2,
        lon: -146.5,
        id: 'C',
        version: versions.C },
      { deleted: true, id: 'D', version: deletions.D },
      { deleted: true, id: 'E', version: deletions.E },
      { type: 'way',
        refs: [ 'A', 'B', 'C' ],
        id: 'F',
        version: versions.F }
    ].sort(idcmp)

    osm.query(q0, function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
    })

    var q1 = [[62, 64], [-149.5, -147.5]]
    var ex1 = [
      { type: 'node',
        lat: 64.5,
        lon: -147.3,
        id: 'A',
        version: versions.A },
      { type: 'node',
        lat: 63.9,
        lon: -147.6,
        id: 'B',
        version: versions.B },
      { type: 'node',
        lat: 64.2,
        lon: -146.5,
        id: 'C',
        version: versions.C },
      { deleted: true, id: 'E', version: deletions.E },
      { type: 'way',
        refs: [ 'A', 'B', 'C' ],
        id: 'F',
        version: versions.F }
    ].sort(idcmp)

    osm.query(q1, function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage query')
    })
    collect(osm.queryStream(q1), function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage stream')
    })

    var q2 = [[62, 64], [-147, -145]]
    var ex2 = []

    osm.query(q2, function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage query')
    })
    collect(osm.queryStream(q2), function (err, res) {
      t.error(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage stream')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
