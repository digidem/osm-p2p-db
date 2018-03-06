var test = require('tape')
var makeOsm = require('./create_db')

test('changeset', function (t) {
  t.plan(21)
  var osm = makeOsm()
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
    if (keys.length === 0) return osm.ready(ready)
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
    osm.getByVersion(versions.A, function (err, doc) {
      t.ifError(err)
      t.equal(doc.tags.comment, 'whatever')
    })
    osm.get(names.A, function (err, doc) {
      t.ifError(err)
      t.equal(doc[Object.keys(doc)[0]].tags.comment, 'whatever')
    })
    osm.getByVersion(versions.F, function (err, doc) {
      t.ifError(err)
      t.equal(doc.tags.comment, 'blah')
    })
    osm.getByVersion('foobar', function (err, doc) {
      t.ok(err)
      t.equals(err.notFound, true)
    })
    osm.get(names.F, function (err, doc) {
      t.ifError(err)
      t.equal(doc[Object.keys(doc)[0]].tags.comment, 'blah')
    })
  }
})
