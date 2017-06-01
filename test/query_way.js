var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('ordered types - node in bbox returns linked way and refs nodes', function (t) {
  t.plan(7)
  var osm = makeOsm()
  var rows = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 1.1, lon: 1.1 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 2.1, lon: 2.1 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 1.2, lon: 1.2 } },
    { type: 'put', key: 'D', value: { type: 'way', refs: [ 'A', 'B', 'C' ] } }
  ]
  osm.batch(rows, function (err, nodes) {
    t.error(err)
    osm.ready(() => query(nodes))
  })

  function query (nodes) {
    var q0 = [[1,2],[1,2]]
    var ext0 = [ 'node', 'node', 'node', 'way' ]
    var ex0 = [
      { type: 'node', lat: 1.1, lon: 1.1,
        id: 'A', version: nodes[0].key },
      { type: 'node', lat: 2.1, lon: 2.1,
        id: 'B', version: nodes[1].key },
      { type: 'node', lat: 1.2, lon: 1.2,
        id: 'C', version: nodes[2].key },
      { type: 'way', refs: [ 'A', 'B', 'C' ],
        id: 'D', version: nodes[3].key }
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
