var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('split', function (t) {
  t.plan(5)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
  var batch0 = [
    { type: 'put', key: 'A', value: { type: 'node', lat: 64.5, lon: -147.3 } },
    { type: 'put', key: 'B', value: { type: 'node', lat: 63.9, lon: -147.6 } },
    { type: 'put', key: 'C', value: { type: 'node', lat: 64.2, lon: -146.5 } },
    { type: 'put', key: 'D', value: { type: 'way', refs: ['A','B','C'] } },
    { type: 'put', key: 'E', value: { type: 'node', lat: 64.1, lon: -146.2 } },
    { type: 'put', key: 'F', value: { type: 'way', refs: ['E'] } }
  ]
  var batch1 = [
    { type: 'del', key: 'A' },
    { type: 'del', key: 'D' },
    { type: 'put', key: 'F', value: { type: 'way', refs: ['B','C','E'] } }
  ]
  osm.batch(batch0, function (err, nodes) {
    t.error(err)
    osm.batch(batch1, function (err, nodes) {
      t.error(err)
      check()
    })
  })
  function check () {
    var q = [[63,65],[-148,-145]]
    osm.query(q, function (err, res) {
      t.error(err)
      var docs = res.map(function (r) {
        return [ r.id, r.deleted || false]
      })
      docs.sort(function cmp (a, b) {
        return a[0] < b[0] ? -1 : 1
      })
      var rows = {}
      res.forEach(function (r) { rows[r.id] = r })
      t.deepEqual(docs, [
        ['A', true],
        ['B', false],
        ['C', false],
        ['D', true],
        ['E', false],
        ['F', false]
      ])
      t.deepEqual(rows.F.refs, ['B','C','E'])
    })
  }
})
