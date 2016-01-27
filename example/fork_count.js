var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')

var level = require('level')
var db = level('/tmp/whatever.db')
var logdb = level('/tmp/whatever.log')

var osmdb = require('../')
var osm = osmdb({
  log: hyperlog(logdb, { valueEncoding: 'json' }),
  db: db,
  store: fdstore(4096, '/tmp/whatever.store')
})

osm.kv.createReadStream({ values: false })
  .on('data', function (row) {
    console.log(row.key, row.links.length)
  })
