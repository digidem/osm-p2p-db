var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('create 3 nodes and a way', function (t) {
  t.plan(14)
  var osm = makeOsm()
  var rows = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'put', key: 'D', value: { type: 'way', refs: [ 'A', 'B', 'C' ] } }
  ]
  osm.batch(rows, function (err, nodes) {
    t.error(err)

    osm.ready(function () { check(nodes) })
  })

  function check (nodes) {
    var pending = 6
    var q0 = [[63, 65], [-148, -146]]
    var ex0 = [
      { type: 'node',
        lat: 64.5,
        lon: -147.3,
        id: 'A',
        version: nodes[0].key },
      { type: 'node',
        lat: 63.9,
        lon: -147.6,
        id: 'B',
        version: nodes[1].key },
      { type: 'node',
        lat: 64.2,
        lon: -146.5,
        id: 'C',
        version: nodes[2].key },
      { type: 'way',
        refs: [ 'A', 'B', 'C' ],
        id: 'D',
        version: nodes[3].key }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage query')
      if (--pending === 0) cleanup()
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex0, 'full coverage stream')
      if (--pending === 0) cleanup()
    })
    var q1 = [[62, 64], [-149.5, -147.5]]
    var ex1 = [
      { type: 'node',
        lat: 64.5,
        lon: -147.3,
        id: 'A',
        version: nodes[0].key },
      { type: 'node',
        lat: 63.9,
        lon: -147.6,
        id: 'B',
        version: nodes[1].key },
      { type: 'node',
        lat: 64.2,
        lon: -146.5,
        id: 'C',
        version: nodes[2].key },
      { type: 'way',
        refs: [ 'A', 'B', 'C' ],
        id: 'D',
        version: nodes[3].key }
    ].sort(idcmp)
    osm.query(q1, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage query')
      if (--pending === 0) cleanup()
    })
    collect(osm.queryStream(q1), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex1, 'partial coverage stream')
      if (--pending === 0) cleanup()
    })
    var q2 = [[62, 64], [-147, -145]]
    var ex2 = []
    osm.query(q2, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage query')
      if (--pending === 0) cleanup()
    })
    collect(osm.queryStream(q2), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp), ex2, 'empty coverage stream')
      if (--pending === 0) cleanup()
    })

    function cleanup () {
      osm.close(function () {
        t.ok(true)
      })
    }
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
