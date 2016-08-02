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
  t.plan(data.length + 4)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
  var nodes = [], docs = {}
  ;(function next () {
    if (data.length === 0) return ready()
    var row = data.shift()
    var prev = docs[row.key]
    var p = prev && prev[prev.length-1]
    var links = p ? [p] : []
    if (row.type === 'del') {
      osm.del(row.key, { links: links }, function (err, node) {
        t.error(err)
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
      t.equal(res.length, 2)
      var node = res.filter(eqtype('node'))[0]
      var way = res.filter(eqtype('way'))[0]
      t.deepEqual(node, {
        type: 'node',
        id: 'n1',
        lat: 64.9,
        lon: -147.9,
        version: nodes[nodes.length-2].key
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

function eqtype (t) {
  return function (node) { return node.type === t }
}
