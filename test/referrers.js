var test = require('tape')
var makeOsm = require('./create_db')

test('getReferrers API', function (t) {
  var db = makeOsm()

  var data = [
    { type: 'node',
      id: 'A',
      lat: '0',
      lon: '0' },
    { type: 'node',
      id: 'B',
      lat: '1',
      lon: '1' },
    { type: 'node',
      id: 'C',
      lat: '5',
      lon: '5' },
    { type: 'way',
      id: 'D',
      refs: [ 'A', 'B', 'C' ] },
    { type: 'relation',
      id: 'E',
      members: [
        { type: 'node', ref: 'B' },
        { type: 'way', ref: 'D' }
      ]
    },
    { type: 'relation',
      id: 'F',
      members: [
        { type: 'node', ref: 'C' },
        { type: 'node', ref: 'B' },
        { type: 'relation', ref: 'E' }
      ]
    }
  ]

  setup(db, data, check)

  function check (err, nodes) {
    t.error(err)
    db.getReferrers('B', function (err, refs) {
      t.error(err)
      var ids = refs.map(function (ref) { return ref.id }).sort()
      t.deepEquals(ids, ['D', 'E', 'F'])
      db.getReferrers('C', function (err, refs) {
        t.error(err)
        var ids = refs.map(function (ref) { return ref.id }).sort()
        t.deepEquals(ids, ['D', 'F'])
        db.getReferrers('E', function (err, refs) {
          t.error(err)
          var ids = refs.map(function (ref) { return ref.id }).sort()
          t.deepEquals(ids, ['F'])
          t.end()
        })
      })
    })
  }
})

test('return only latest referrers to a node: way', function (t) {
  var db = makeOsm()

  var data = [
    { type: 'node',
      id: 'A',
      lat: '0',
      lon: '0',
      tags: {} },
    { type: 'node',
      id: 'B',
      lat: '1',
      lon: '1',
      tags: {} },
    { type: 'node',
      id: 'C',
      lat: '2',
      lon: '2',
      tags: {} },
    { type: 'way',
      id: 'D',
      refs: ['A', 'B', 'C'],
      tags: {} }
  ]

  setup(db, data, function (err) {
    t.error(err)

    // Update way
    var way = data[3]
    way.tags = { foo: 'bar' }
    way.changeset = '123'

    db.put('D', way, function (err) {
      t.error(err)
      db.getReferrers('A', function (err, refs) {
        t.error(err)
        t.equals(refs.length, 1)
        t.equals(refs[0].id, 'D')
        t.end()
      })
    })
  })
})

test('return only latest referrers to a node: relation', function (t) {
  var db = makeOsm()

  var data = [
    { type: 'node',
      id: 'A',
      lat: '0',
      lon: '0',
      tags: {} },
    { type: 'node',
      id: 'B',
      lat: '1',
      lon: '1',
      tags: {} },
    { type: 'relation',
      id: 'C',
      members: [ { type: 'node', ref: 'B' } ],
      tags: {} }
  ]

  setup(db, data, function (err) {
    t.error(err)

    // Update relation
    var rel = data[2]
    rel.tags = { foo: 'bar' }
    rel.changeset = '123'
    rel.members = []

    db.put('C', rel, function (err) {
      t.error(err)
      db.getReferrers('B', function (err, refs) {
        t.error(err)
        t.equals(refs.length, 0)
        t.end()
      })
    })
  })
})

function setup (db, data, cb) {
  var rows = dataToBatchOps(data)
  db.batch(rows, function (err, nodes) {
    if (err) cb(err)
    else db.ready(cb.bind(null, null, nodes))
  })
}

function dataToBatchOps (data) {
  return data.map(function (elm) {
    var id = elm.id
    delete elm.id
    return {
      type: 'put',
      key: id,
      value: elm
    }
  })
}
