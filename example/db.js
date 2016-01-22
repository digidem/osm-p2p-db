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
  store: fdstore(4096, storefile)
})

if (process.argv[2] === 'create') {
  var value = JSON.parse(process.argv[3])
  osm.create(value, function (err, key, node) {
    if (err) console.error(err)
    else console.log(key)
  })
} else if (process.argv[2] === 'query') {
  var q = process.argv.slice(3).map(csplit)
  osm.query(q, function (err, pts) {
    if (err) console.error(err)
    else pts.forEach(function (pt) {
      console.log(pt)
    })
  })
}

function csplit (x) { return x.split(',').map(Number) }
