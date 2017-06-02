var test = require('tape')
var collect = require('collect-stream')
var makeOsm = require('./create_db')

test('batch relation of ways', function (t) {
  t.plan(5)
  var batch = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'put', key: 'D', value: { type: 'way', refs: [ 'A', 'B', 'C' ] } },
    { type: 'put', key: 'E', value: { type: 'node', lat: 62.1, lon: -145.1 } },
    { type: 'put', key: 'F', value: { type: 'node', lat: 62.3, lon: -146.4 } },
    { type: 'put', key: 'G', value: { type: 'node', lat: 62.6, lon: -146.0 } },
    { type: 'put', key: 'H', value: { type: 'way', refs: [ 'E', 'F', 'G' ] } },
    { type: 'put', key: 'I', value: { type: 'relation', members: [
      { type: 'way', ref: 'D' },
      { type: 'way', ref: 'H' },
      { type: 'node', ref: 'G' }
    ] } }
  ]
  var osm = makeOsm()
  osm.batch(batch, function (err) {
    t.error(err)
    osm.ready(query)
  })

  function query () {
    var q0 = [[62,63],[-145.5,-144.5]]
    var ex0 = [
      { type: 'node', lat: 62.1, lon: -145.1, id: 'E' },
      { type: 'node', lat: 62.3, lon: -146.4, id: 'F' },
      { type: 'node', lat: 62.6, lon: -146.0, id: 'G' },
      { type: 'way', refs: [ 'E', 'F', 'G' ], id: 'H' },
      { type: 'relation',
        members: [
          { type: 'way', ref: 'D' },
          { type: 'way', ref: 'H' },
          { type: 'node', ref: 'G' }
        ],
        id: 'I' }
    ].sort(idcmp)
    osm.query(q0, function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp).map(nover), ex0, 'relation of ways')
    })
    collect(osm.queryStream(q0), function (err, res) {
      t.ifError(err)
      t.deepEqual(res.sort(idcmp).map(nover), ex0, 'relation of ways stream')
    })
  }
})

function idcmp (a, b) {
  return a.id < b.id ? -1 : 1
}
function nover (row) {
  delete row.version
  return row
}
