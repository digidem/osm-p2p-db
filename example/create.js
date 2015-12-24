var hyperlog = require('hyperlog')

var level = require('level')
var db = {
  log: level('/tmp/osm-p2p/log'),
  index: level('/tmp/osm-p2p/index')
}
var fdstore = require('fd-chunk-store')
var storefile = '/tmp/osm-p2p/kdb'

var osmdb = require('../')
var osm = osmdb({
  log: hyperlog(db.log, { valueEncoding: 'json' }),
  db: db.index,
  store: fdstore(4096, storefile),
  size: 4096
})

var value = process.argv[2]
osm.create(value, function (err, key, node) {
  console.log(key)
})
