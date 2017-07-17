var hyperlog = require('hyperlog')
var memstore = require('memory-chunk-store')
var memdb = require('memdb')

module.exports = function () {
  var osmdb = require('../')

  return osmdb({
    log: hyperlog(memdb(), { valueEncoding: 'json' }),
    db: memdb(),
    store: memstore(4096)
  })
}
