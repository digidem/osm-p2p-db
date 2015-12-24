# osm-p2p-db

p2p database for open street map data

# example

```
var hyperlog = require('hyperlog')

var level = require('level')
var db = {
  log: level('/tmp/osm-p2p/log'),
  index: level('/tmp/osm-p2p/index')
}
var fdstore = require('fd-chunk-store')
var storefile = '/tmp/osm-p2p/kdb'

var osmdb = require('osm-p2p-db')
var osm = osmdb({
  log: hyperlog(db.log, { valueEncoding: 'json' }),
  db: db.index,
  store: fdstore(4096, storefile),
  size: 4096
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
```

Now we can create a few nodes and search with a bounding box query:

```
$ mkdir /tmp/osm-p2p
$ node db.js create '{"type":"node","loc":[64.6,-147.8]}'
400427819db37b43
$ node db.js create '{"type":"node","loc":[64.3,-148.2]}'
76edd8b6d52da3fb
$ node db.js create '{"type":"node","loc":[64.5,-147.3]}'
013d2331efaba7a5
$ node db.js query 64.1,64.6 -148,-147
{ type: 'node', loc: [ 64.5, -147.3 ], id: '013d2331efaba7a5' }
```

We can make a `way` document that refers to a list of `node` documents:

```
$ node db.js create '{"type":"way","refs":
["400427819db37b43","76edd8b6d52da3fb","013d2331efaba7a5"]}'
611336e6def6bd93
```

When we query, any `ways` that have one or more nodes within the bounding box
will turn up in the results:

```
$ node db.js query 64.1,64.6 -148,-147
{ type: 'node', loc: [ 64.5, -147.3 ], id: '013d2331efaba7a5' }
{ type: 'way',
  refs: [ '400427819db37b43', '76edd8b6d52da3fb', '013d2331efaba7a5' ],
  id: '611336e6def6bd93' }
```

# api

``` js
var osmdb = require('osm-p2p-db')
```

## var osm = osmdb(opts)

Create a new `osm` instance with:

* `opts.log` - a [hyperlog][1] with a valueEncoding of `json`
* `opts.db` - a [levelup][2] instance to store index data
* `opts.store` - an [abstract-chunk-store][3] instance
* `opts.size` - the size of the chunks in `opts.store`

You may safely delete the index database whenever you like. The index data is
automatically regenerated. This is very useful if there are breaking changes to
the index code or if the data becomes corrupted. The hyperlog contains the
source of truth.

[1]: https://npmjs.com/package/hyperlog
[2]: https://npmjs.com/package/levelup
[3]: https://npmjs.com/package/abstract-chunk-store

## osm.create(doc, opts={}, cb)

Store a new document from `doc`. `cb(err, id, node)` fires with the generated
OSM `id` and the `node` from the underlying hyperlog.

* Nodes should have a `doc.loc` array with `[lat,lon]` coordinate pairs.
* Ways should have an array of OSM keys as `doc.refs`.
* Relations should have an array of OSM keys as `doc.members`.

## osm.put(id, doc, opts={}, cb)

Replace a document at `id` with `doc`.

If the document didn't exist previously, it will be created.

The options `opts` are passed to the underlying [hyperkv][4] instance.

[4]: https://npmjs.com/package/hyperkv

## osm.get(id, opts={}, cb)

Get a document as `cb(err, docs)` by its OSM `id`.

`docs` is an object mapping hyperlog hashes to current document values.

The options `opts` are passed to the underlying [hyperkv][4] instance.

## osm.query(q, opts, cb)

Query for all nodes, ways, and relations in the query given by the array `q`.
Queries are arrays of `[[minLat,maxLat],[minLon,maxLon]]` specifying a bounding
box.

`cb(err, res)` fires with an array of results `res`. Each result is the
document augmented with an `id` property.

## var rstream = osm.queryStream(q, opts)

Return a readable object stream `rstream` of query results contained in the
query `q`. Queries are arrays of `[[minLat,maxLat],[minLon,maxLon]]` specifying
a bounding box.

Each object in the stream is a document augmented with an `id` property.

# browser

To use this module in the browser, use [level-browserify][5] to provide the
`opts.db` instance backed by IndexedDB.

[5]: https://npmjs.com/package/level-browserify

# replication

If you have two hyperlogs `log0` and `log1`, pipe them together and back again
to replicate:

```
var r0 = log0.replicate()
var r1 = log1.replicate()
r0.pipe(r1).pipe(r0)
```

Insert additional streams as necessary for network transports if the logs live
in different processes or machines.

# install

```
npm install osm-p2p-db
```

# license

BSD
