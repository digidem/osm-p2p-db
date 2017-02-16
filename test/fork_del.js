var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var collect = require('collect-stream')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

//       /-- A1 <--\
// A <---           --- (deletion)
//       \-- A2 <--/
test('forked node /w merging delete', function (t) {
  t.plan(11)

  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })

  var A = { type: 'node', lat: 0, lon: 0 }
  var A1 = { type: 'node', lat: 1, lon: 1 }
  var A2 = { type: 'node', lat: 2, lon: 2 }
  osm.create(A, function (err, id, node0) {
    t.ifError(err)
    osm.put(id, A1, { links: [node0.key] }, function (err, node1) {
      t.ifError(err)
      t.deepEquals(node1.links, [node0.key], 'node1 links')
      osm.put(id, A2, { links: [node0.key] }, function (err, node2) {
        t.ifError(err)
        t.deepEquals(node2.links, [node0.key], 'node2 links')
        osm.del(id, function (err, delNode) {
          t.ifError(err)
          t.deepEquals(delNode.links, [node1.key, node2.key], 'del node links')
          osm.get(id, function (err, docs) {
            t.ifError(err)
            t.equals(Object.keys(docs).length, 1)
            var doc = docs[delNode.key]
            t.equals(doc.deleted, true)
            t.equals(doc.id, id)
          })
        })
      })
    })
  })

})
