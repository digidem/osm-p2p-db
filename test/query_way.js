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
    osm.ready(function () { query(nodes) })
  })

  function query (nodes) {
    var q0 = [[1, 2], [1, 2]]
    var ext0 = [ 'node', 'node', 'node', 'way' ]
    var ex0 = [
      { type: 'node',
        lat: 1.1,
        lon: 1.1,
        id: 'A',
        version: nodes[0].key },
      { type: 'node',
        lat: 2.1,
        lon: 2.1,
        id: 'B',
        version: nodes[1].key },
      { type: 'node',
        lat: 1.2,
        lon: 1.2,
        id: 'C',
        version: nodes[2].key },
      { type: 'way',
        refs: [ 'A', 'B', 'C' ],
        id: 'D',
        version: nodes[3].key }
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

test('multiple ways sharing nodes', function (t) {
  t.plan(7)

  var osm = makeOsm()

  var rows = [
    { type: 'put', key: 'A', value: {"type":"node","lon":-72.0929645381262,"lat":-4.5449438441953305} },
    { type: 'put', key: 'B', value: {"type":"node","lon":-72.0926898458029,"lat":-4.544872757296443} },
    { type: 'put', key: 'C', value: {"type":"node","lon":-72.09261644856267,"lat":-4.544951058228343} },
    { type: 'put', key: 'D', value: {"type":"node","lon":-72.09288826173976,"lat":-4.544873517911439} },
    { type: 'put', key: 'E', value: {"type":"node","lon":-72.09278144735785,"lat":-4.5447750358021795} },
    { type: 'put', key: 'F', value: {"type":"way","refs":["A","D","B","E","C"],"tags":{"waterway":"river"}} },
    { type: 'put', key: 'G', value: {"type":"way","refs":["D","E"],"tags":{"waterway":"spring"}} },
  ]

  osm.batch(rows, function (err, nodes) {
    t.error(err)
    osm.ready(function () { query(nodes) })
  })

  function query (nodes) {
    // var q0 = [[-100, 100], [-100, 100]]
    var q0 = [[-4.565473550710253,-4.5435702793717345],[-72.11425781250001,-72.09228515625001]]
    var ext0 = [ 'node', 'node', 'node', 'node', 'node', 'way', 'way' ]
    var ex0 = [
      {"id":"A","type":"node","lon":-72.0929645381262,"lat":-4.5449438441953305},
      {"id":"B","type":"node","lon":-72.0926898458029,"lat":-4.544872757296443},
      {"id":"C","type":"node","lon":-72.09261644856267,"lat":-4.544951058228343},
      {"id":"D","type":"node","lon":-72.09288826173976,"lat":-4.544873517911439},
      {"id":"E","type":"node","lon":-72.09278144735785,"lat":-4.5447750358021795},
      {"id":"F","type":"way","refs":["A","D","B","E","C"],"tags":{"waterway":"river"}},
      {"id":"G","type":"way","refs":["D","E"],"tags":{"waterway":"spring"}}
    ].sort(idcmp)

    osm.query(q0, { order: 'type' }, function (err, res) {
      t.error(err)
      res.forEach(function (elm) { delete elm.version })
      t.deepEqual(res.map(type), ext0, 'types')
      t.deepEqual(res.sort(idcmp), ex0, 'results')
    })
    collect(osm.queryStream(q0, { order: 'type' }), function (err, res) {
      t.error(err)
      console.log('res', res)
      res.forEach(function (elm) { delete elm.version })
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
