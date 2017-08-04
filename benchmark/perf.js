var hyperlog = require('hyperlog')
var level = require('level')
var osmdb = require('..')
var fdstore = require('fd-chunk-store')
var rimraf = require('rimraf')

var osm = osmdb({
  log: hyperlog(level('log1'), { valueEncoding: 'json' }),
  db: level('index1'),
  store: fdstore(4096, 'kdb1')
})

var osm2 = osmdb({
  log: hyperlog(level('log2'), { valueEncoding: 'json' }),
  db: level('index2'),
  store: fdstore(4096, 'kdb2')
})

var batch = []
var n = 10000
console.log('inserting', n, 'documents')
for (var i=0; i < n; i++) {
  var node = {
    type: 'node',
    lat: Math.random() * 1000 - 500,
    lon: Math.random() * 1000 - 500
  }
  batch.push({ type: 'put', key: ''+i, value: node })
}

console.time('batch')
osm.batch(batch, function (err, res) {
  console.timeEnd('batch')
  console.time('indexing')
  osm.ready(function () {
    console.timeEnd('indexing')
    console.time('replicate')
    replicate(function () {
      console.timeEnd('replicate')
      cleanup(function () {
        console.log('done')
      })
    })
  })
})

function replicate (cb) {
  var r1 = osm.log.replicate()
  var r2 = osm2.log.replicate()

  r1.pipe(r2).pipe(r1)

  r1.on('end', done)
  r2.on('end', done)

  var pending = 2
  function done () {
    if (!--pending) cb()
  }
}

function cleanup (cb) {
  rimraf.sync('./log1')
  rimraf.sync('./kdb1')
  rimraf.sync('./index1')
  rimraf.sync('./log2')
  rimraf.sync('./kdb2')
  rimraf.sync('./index2')
  process.nextTick(cb)
}
