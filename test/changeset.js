var test = require('tape')
var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')

var tmpdir = require('os').tmpdir()
var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

var osmdb = require('../')

test('changeset', function (t) {
  t.plan(15)
  var osm = osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile),
    size: 4096
  })
  var docs = {
    A: { type: 'changeset', tags: { comment: 'whatever' } },
    B: { type: 'node', lat: 64.5, lon: -147.3, changeset: 'A' },
    C: { type: 'node', lat: 63.9, lon: -147.6, changeset: 'A' },
    D: { type: 'node', lat: 64.2, lon: -146.5, changeset: 'A' },
    E: { type: 'way', refs: [ 'B', 'C', 'D' ], changeset: 'A' },
    F: { type: 'changeset', tags: { comment: 'blah' } },
    G: { type: 'node', lat: 64.2, lon: -146.5, changeset: 'F' }
  }
  var names = {}
  var nodes = {}
  var versions = {}

  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) return ready()
    var key = keys.shift()
    var doc = docs[key]
    if (doc.refs) {
      doc.refs = doc.refs.map(function (ref) { return names[ref] })
    }
    if (doc.changeset) {
      doc.changeset = names[doc.changeset]
    }
    osm.create(doc, function (err, k, node) {
      t.ifError(err)
      names[key] = k
      versions[key] = node.key
      nodes[k] = node
      next()
    })
  })()

  function ready () {
    osm.getChanges(names.A, function (err, keys) {
      t.ifError(err)
      var expected = [ versions.B, versions.C, versions.D, versions.E ]
      t.deepEqual(keys, expected.sort())
    })
    osm.getChanges(names.F, function (err, keys) {
      t.ifError(err)
      var expected = [ versions.G ]
      t.deepEqual(keys, expected.sort())
    })
    osm.get(names.A, function (err, doc) {
      t.ifError(err)
      t.equal(doc[Object.keys(doc)[0]].tags.comment, 'whatever')
    })
    osm.get(names.F, function (err, doc) {
      t.ifError(err)
      t.equal(doc[Object.keys(doc)[0]].tags.comment, 'blah')
    })
  }
})
