var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('ordered types', function (t) {
  t.plan(7)
  var osm = makeOsm()
  var rows = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'put', key: 'D', value: { type: 'way', refs: [ 'A', 'B', 'C' ] } },
    { type: 'put', key: 'E', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'F', value: { type: 'node', lat: 65.1, lon: -148.5 } },
    { type: 'put', key: 'G', value: { type: 'way', refs: [ 'E', 'F' ] } }
  ]
  osm.batch(rows, function (err, nodes) {
    t.error(err)
    osm.ready(function () { query(nodes) })
  })

  function query (nodes) {
    var q0 = [[63, 65], [-148, -146]]
    var ext0 = [ 'node', 'node', 'node', 'node', 'node', 'way', 'way' ]
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
      { type: 'node',
        lat: 64.5,
        lon: -147.3,
        id: 'E',
        version: nodes[4].key },
      { type: 'node',
        lat: 65.1,
        lon: -148.5,
        id: 'F',
        version: nodes[5].key },
      { type: 'way',
        refs: [ 'A', 'B', 'C' ],
        id: 'D',
        version: nodes[3].key },
      { type: 'way',
        refs: [ 'E', 'F' ],
        id: 'G',
        version: nodes[6].key }
    ].sort(idcmp)

    osm.query(q0, { order: 'type' }, function (err, res) {
      t.error(err)
      t.deepEqual(res.map(type), ext0, 'types')
      t.deepEqual(res.sort(idcmp), ex0, 'results')
    })
    collect(osm.queryStream(q0, { order: 'type' }), function (err, res) {
      t.error(err)
      t.deepEqual(res.map(type), ext0, 'types')
      t.deepEqual(res.sort(idcmp), ex0, 'results')
    })
  }
})

function type (x) { return x.type }
function idcmp (a, b) {
  return a.type === b.type
    ? (a.id < b.id ? -1 : 1)
    : cmpt(a.type, b.type)
}
var types = { node: 0, way: 1, relation: 2 }
function cmpt (a, b) { return types[a] - types[b] }
