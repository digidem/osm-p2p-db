# architecture

This document describes the underlying architecture of osm-p2p-db, some
background context, and rationale for the architecture decisions.

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

# chunk-store

Some pieces of osm-p2p-db make use of another storage abstraction for accessing
fixed-size contiguous blocks. osm-p2p-db expects an `opts.store` that conforms
to the [abstract-chunk-store][13] API.

Chunk stores are instantiated with a fixed size for every chunk and they provide
two methods: `put` and `get`. `put` stores a fixed-size buffer at some chunk
index and `get` retrieves the fixed-size buffer at a chunk index.

On the server, chunk stores can efficiently provide access to files on disk with
no additional overhead using a module such as [fd-chunk-store][14], but in the
browser, we have to use an IndexedDB wrapper such as [idb-chunk-store][15].

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
entirely reliable or trustworthy.

Merkle DAGs also express an inherent causality of the data, because to link to
another hash, you must know the hash of its contents. This means that if
document B links to document A, document A must have come before document B.

Merkle DAGs should be familar to many programmers because they are the
underlying data structure for git and many other distributed version control
systems.

The hyperlog constructor expects a [leveldb instance][1] as its first argument
and the library works in both node and the browser. The hyperlog instance is
provided in an argument as `opts.log` to avoid stale versioning and to make it
easier to use the log for other purposes or to present a log with the hyperlog
API derived from some other underlying implementation for a similar reason as
`opts.db`.

## hyperlog data model

Each edit to osm-p2p-db creates a new log entry that points back at:

* a single previous entry when there is an update to existing content
* no previous entries when a new node is created
* multiple previous entries to merge multiple forks into a single record

There are 3 types of elements in OSM: nodes, ways, and relations.
Each element contains a `type` and `changeset` field.

---

Nodes have `lat` and `lon` properties:

```
{ type: 'node', lat: 65.5, lon: -147.3,
  changeset: '11684423598651588865' }
```

---

Ways have an array of `refs`:

```
{ type: 'way',
  changeset: '11684423598651588865',
  refs: [ '11892499690884077339', '1982521011513780909', '14062704270722785878' ] }
```
---

[Relations][18] have an array of `members`:

```
{ type: 'relation',
  changeset: '11684423598651588865',
  members: [
    { type: 'way', ref: '11159214216856885183' },
    { type: 'node', ref: '15822678485571473814' }
  ] }
```

Each member has the `type` of the document pointed at by `ref` and an optional
[`role` property][19].

---

When the documents are written to osm-p2p-db, they are given `id` and `version`
properties.

The `id` is a random decimal string that uniquely identifies new documents.
Updates to existing nodes use the same `id` as the document they replace. Ways
and relations use arrays of these `id` strings to reference other nodes so that
if a document changes, any ways and relations that reference the document will
point at the latest versions.

In OSM, the `id` property is a monotonically increasing integer that uniquely
identifies documents. The centralized OSM service ensures that two documents
will not have the same `id`. However, there is no central service to enforce
monotonically increasing integer `id` values in a p2p architecture so we rely on
entropy to provide uniqueness. It is exceptionally unlikely that two large
datasets will contain the same cryptographically random 20-digit decimal `id`
for the scale of data likely to be encountered in osm-p2p-db.

For similar reasons, the `version` property is different in osm-p2p-db than in
OSM. In OSM, versions are part of an [optimistic locking][11] strategy where
version numbers monotonically increase by 1 for every change. This cannot work
for osm-p2p-db because two users could both edit the same document while
offline, resulting in multiple alternate contents under the same `version`
values. Instead, osm-p2p-db uses the hash of the contents from the underlying
hyperlog to provide a value for the `version` property. This way, two versions
of the same document will never have the same version unless they also have the
exact same contents.

### deletions

Like OSM, documents in osm-p2p-db can be deleted. However, since hyperlog is an
append-only data structure, true deletion of data cannot occur. Instead, a
deleted document leaves behind a "tombstone", marking a particular OSM document
as deleted.

This happens via [hyperkv][12], which surfaces entries as either
- `{ <key>: { value: <document> } }` or
- `{ <key>: { deleted: true } }`

Causality is maintained, meaning a deletion tombstone links backward to the
document(s) that it is indicating a deletion of.

### forks

In a DAG with causal linking, such as hyperlog, history is non-linear. You might
have a document that was edited or deleted on different machines before
replicating to each other:

```
        /---- B <--- C <--- (del) <---\
A <-----                               --- F
        \---- E <---------------------/
```

Here, the original document (A) was edited twice and then deleted on one
machine, and edited once on another machine. After both sets of modifications
were replicated to a single machine, another edit (F) took place.

This expression of data can be confusing when reasoning in the context of a
linear-history system like OSM. There may not always be an obvious or
unambiguous way of presenting the data that conforms with e.g. the OSM API,
which assumes a linear history.

osm-p2p-db embraces the forking, ambiguous nature of data inherent in a
distributed system, and exposes it unfettered through its API. The
responsibility of managing forks is left in the hands of downstream modules,
which could employ a variety of different possible forms: automatic merging,
presenting a conflict resolution user interface, or others.

### changesets

Each element must refer to a pre-existing changeset. Changesets are a way to
batch changes up into logical groups. Think of changesets like commits in git.

Changesets should contain tags. Some common tags are `comment` and `created_by`.

Here is an example changeset:

```
{ type: 'changeset',
  tags: { comment: 'adding trailheads' } }
```

Like the other elements, changesets are given `id` and `version` properties
automatically when they are written to osm-p2p-db.

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
Or some other transport altogether! With streams we have the flexibility to
easily [support any combination][16] of compression, encryption, stdin/stdout,
ssh, or alternative transports that haven't even been invented yet.

The osm-p2p-db instances themselves do not need to get involved in the
replication process at all, since the osm-p2p-db indexes are already hooked up
to a live feed of hyperlog updates.

## p2p replication

An important detail about hyperlogs and hyperlog replication is that the
replication works according to a fully peer to peer model: each peer has
unique information that is shared with partners in replication. There is no
privledged node that centrally coordinates the state of the database.
There is also no single point of failure that may become corrupted, inoperable,
stolen, or confiscated. Instead there are many redundant backups.

For mapping projects that are far from grid power and cellular signals,
redundant backups are a particularly important feature.

If we are operating in these environments with a fully peer to peer model, we
should also rethink how conflicts are typically handled for data replication. In
most databases that support replication, when two peers with different updates
to the same keys try to replicate, the replication will fail or in the worst
case the entire system goes into "merge conflict" panic mode where nothing can
be done until the conflict is resolved. These are the failure modes of couchdb
and git, among many others.

This not only provides a terrible experience for users of the software, it also
forces an unpleasant and difficult activity that could just as well be deferred
or handled by more experienced users or at a more appropriate time. Imagine the
anxiety a merge conflict would create for a user desperately attempting to
replicate over a slow radio uplink with a small time window and limited battery
power. This would be the absolute worst time to be poking around in unfamiliar
and obscure interfaces to carefully merge changes with the other node.

Instead, we can think of our database as a growing list of observations.
Replication then becomes a simple matter of sharing our observations with a
peer. If two observations "conflict", then the only honest thing the database
can really say is that there are two most recent versions of a document.
Diversity of opinion does not mean we need to enter into an extreme mode that
demands our full attention for immediate resolution. If we think of the database
as a repository of truth, it would also be unwise for our database to report
falsehoods, such as erroneously picking a "winner" for a "conflict" according to
some necessarily flawed heuristic approximation. There is no general solution to
the problem of merging conflicts for human-generated data. These issues will
always require thoughtful human judgement.

# hyperlog indexes

osm-p2p-db is a [kappa architecture][7]. The basic idea in the kappa
architecture is that there is an append-only log that stores immutable
observations. The log feeds into a set of [materialized views][8] that
pre-compute indexes for aggregate information contained in the log data.

For example, a log in a shop might append a new record for every purchase, and a
materialized view might show the monthly sales total. Contrast this log-driven
approach with a database that destructively updates a sales total in place. If
there are errors in the collection procedure, malicious changes, or a different
kind of sales total such as yearly needs to be computed, the log can easily
support these issues whereas the mutable data cannot. The log is the source of
truth, and many derived truths can be built on top of the log observations.

The [hyperlog-index module][9] provides an interface to create materialized
views on top of a hyperlog. osm-p2p-db is internally composed of 3
hyperlog-index instances: a key/value store, a kdb tree spatial index, and a
reference index.

Every [hyperlog-index][9] contains an indexing function that receives a record
from the hyperlog as input and writes to some external data store with its view
on the data. A tricky feature of hyperlogs is that they are merkle DAGs, which
may point at many prior documents by their hashes, and indexes that deal with
key/value data must take into account the inherent potential for forking
versions.

## hyperkv

We can borrow a useful idea from [CRDTs][10] called a multi-value register to
handle forking presentations for key/value data. The multi-value register idea
is very simple: for every key, always return an array of values. These values
represent the heads of the merkle DAG for the given key, the documents which are
not pointed at by any other document.

The [hyperkv][12] module is a hyperlog index used internally by osm-p2p-db that
provides a multi-value register conflict strategy for the OSM documents.
The keys given to [hyperkv][12] are handled by the `id` property from the
[data model](#hyperlog-data-model) and the values are the document bodies.

Lookups by `id` for hyperkv returns an object mapping document hashes to
document contents and puts and deletes must refer to the hashes of previously
known documents as `opts.links`.

## spatial trees

The next piece in our architecture is a spatial tree to respond to bounding box
queries. As documents are written to the hyperlog by [hyperkv][12],
[hyperlog-kdb-index][13] looks for nodes with `lat` and `lon` properties and
inserts these coordinate pairs into a [kdb tree][17].

Queries on the kdb tree return all the nodes contained within a bounding box,
but not the ways or relations that don't directly have `lat` and `lon`
properties.

## reference index

The reference index is a hyperlog index that associates each node with any
relations and ways that refer to the node by its `id` in their `refs` or
`members` arrays.

Bounding box queries on the kdb tree contain only nodes, so the reference index
augments the queries with ways and relations associated with each node in the
results.

[1]: https://github.com/level/levelup
[2]: https://github.com/maxogden/level.js
[3]: https://npmjs.com/package/hyperlog
[4]: https://en.wikipedia.org/wiki/Gossip_protocol
[5]: https://github.com/feross/simple-peer
[6]: https://developer.mozilla.org/en-US/docs/Web/API/BluetoothDevice
[7]: http://www.kappa-architecture.com/
[8]: https://en.wikipedia.org/wiki/Materialized_view
[9]: https://en.wikipedia.org/wiki/Materialized_view
[10]: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type
[11]: http://wiki.openstreetmap.org/wiki/API_v0.6#Version_numbers.2Foptimistic_locking
[12]: https://npmjs.com/package/hyperkv
[13]: https://github.com/mafintosh/abstract-chunk-store
[14]: https://www.npmjs.com/package/fd-chunk-store
[15]: https://www.npmjs.com/package/idb-chunk-store
[16]: https://github.com/dominictarr/rpc-stream#rant
[17]: https://en.wikipedia.org/wiki/K-D-B-tree
[18]: http://wiki.openstreetmap.org/wiki/Relation
[19]: http://wiki.openstreetmap.org/wiki/Relation#Roles
