var hyperlog = require('hyperlog')
var fdstore = require('fd-chunk-store')
var path = require('path')
var memdb = require('memdb')
var tmpdir = require('os').tmpdir()

module.exports = function () {
  var storefile = path.join(tmpdir, 'osm-store-' + Math.random())

  var osmdb = require('../')

  return osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: fdstore(4096, storefile)
  })
}
