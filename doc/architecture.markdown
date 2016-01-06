# architecture

This document describes the underlying architecture of osm-p2p-db and some
background context.

# leveldb

IndexedDB is a database that browsers expose to javascript running in web pages.
To support IndexedDB for chrome, engineers from google released an embedded
database written in C++ called LevelDB.

LevelDB has [very good bindings in node.js][1] and a vast ecosystem of libraries that
build on top of the simple LevelDB API.

Unfortunately, the IndexedDB is not very simple, so most people building webapps
for IndexedDB use wrapper libraries. Luckily, there are [very good wrappers][2]
that present the node.js LevelDB API over top of the IndexedDB API. This means
that libraries written for the leveldb API can work on the server using node.js
and also in the browser using leveldb IndexedDB wrappers.

osm-p2p-db accepts an `opts.db` parameter that can be supplied by the C++
LevelDB implementation in node.js or by the IndexedDB wrappers when in the
browser.

# hyperlog

osm-p2p-db provides indexes and actions on top of a [hyperlog][3].
[hyperlog][3] is an append-only persistent data structure that implements a
merkle DAG. In a merkle DAG, nodes are addressed by the hash of their contents.
To point at another document, a node must refer to the external document by its hash.

A node's address is the hash of its content, so if a node is modified or becomes
corrupted, its hash will change and documents that linked at the old version of
the node will not link to the new, modified version. This has important
implications: it means that every change is preserved permanently in the history
(like a wiki) and it means that if you know that a hash is trustworthy, you know
that the node addressed by that hash is trustworthy, and every document pointed
to by that hash is also trustworthy, recursively down to the first document.

This makes merkle DAGs robust against unreliable hardware, spotty network
connections, and malicious tampering. It also means that [gossip protocols][4]
can be safely used for peer to peer data replication, even if some peers are not
entirely reliable or trustworthy. Merkle DAGs should be familar to many
programmers because they are the underlying data structure for git and many
other distributed version control systems.

The hyperlog constructor expects a [leveldb instance][1] as its first argument
and the library works in both node and the browser. The hyperlog instance is
provided in an argument as `opts.log` to avoid stale versioning and to make it
easier to use the log for other purposes or to present a log with the hyperlog
API derived from some other underlying implementation for a similar reason as
`opts.db`.

## hyperlog replication

Data replication with merkle DAGs is conceptually very simple: two peers that
wish to replicate each advertise the hashes they have and then each peer
downloads the documents that they don't have from the other.

There are some additional optimizations to this replication scheme that hyperlog
provides for added efficiency during the initial hash discovery phase, such as a
unique identifier to save the state of previous replication exchanges.
Hyperlog has another trick for replication that uses the merkle structure to
exchange a minimal amount of metadata using a binary search.

The interface for hyperlog replication is a general-purpose
[duplex stream](https://github.com/substack/stream-handbook#duplex). This
interface makes it easy to support a wide variety of transports in both node and
the browser without tightly coupling to a particular implementation.

Replication is performed by piping together the replication streams of two
hyperlogs that back different osm-p2p-db instances. For example to replicate two
instances in the same process:

``` js
var level = require('level')
var hyperlog = require('hyperlog')
var log0 = hyperlog(level('/tmp/log0'))
var log1 = hyperlog(level('/tmp/log1'))

var r0 = log0.replicate()
var r1 = log1.replicate()
r0.pipe(r1).pipe(r0)
```

If the nodes live on different processes or machines, we can use a transport,
such as tcp:

tcp server:

``` js
var level = require('level')
var hyperlog = require('hyperlog')
var log = hyperlog(level('/tmp/log-' + Math.random())

var net = require('net')
var server = net.createServer(function (stream) {
  stream.pipe(log.replicate()).pipe(stream)
})
server.listen(5000)
```

tcp client:

``` js
var level = require('level')
var hyperlog = require('hyperlog')
var log = hyperlog(level('/tmp/log-' + Math.random())

var net = require('net')
var stream = net.connect('localhost', 5000)
stream.pipe(log.replicate()).pipe(stream)
```

Or websockets:


websocket server:

``` js
var level = require('level')
var hyperlog = require('hyperlog')
var log = hyperlog(level('/tmp/log-' + Math.random())

var wsock = require('websocket-stream')
var http = require('http')
var server = http.createServer(function (req, res) {
  res.end('beep boop\n')
})
server.listen(5000)

wsock.createServer({ server: server }, function (stream) {
  stream.pipe(log.replicate()).pipe(stream)
})
```

websocket client:

``` js
var level = require('level')
var hyperlog = require('hyperlog')
var log = hyperlog(level('/tmp/log-' + Math.random())

var wsock = require('websocket-stream')
var stream = wsock('ws://localhost:5000')
stream.pipe(log.replicate()).pipe(stream)
```

Or even without any server at all using [webrtc][5] or [bluetooth][6]!
Or some other transport altogether!

The osm-p2p-db instances themselves do not need to get involved in the
replication process at all, since the osm-p2p-db indexes are already hooked up
to a live feed of hyperlog updates.

## hyperlog indexes

kappa architecture


materialized views



# key/value store



# spatial trees

In the future, other trees may be more appropriate.

For example, ways and relations could be stored directly in an
[interval tree][7]

[1]: https://github.com/level/levelup
[2]: https://github.com/maxogden/level.js
[3]: https://npmjs.com/package/hyperlog
[4]: https://en.wikipedia.org/wiki/Gossip_protocol
[5]: https://github.com/feross/simple-peer
[6]: https://developer.mozilla.org/en-US/docs/Web/API/BluetoothDevice
[7]: https://en.wikipedia.org/wiki/Interval_tree

