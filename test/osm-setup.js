module.exports = setupTest

function setupTest (osm, docs, done) {
  var keys = Object.keys(docs).sort()

  var nodes = {}
  var versions = {}
  var names = {}

  ;(function next () {
    if (keys.length === 0) return done(null, nodes, versions, names)
    var key = keys.shift()
    var doc = docs[key]
    if (doc.refs) {
      doc.refs = doc.refs.map(function (ref) { return names[ref] })
    }
    if (doc.members) {
      doc.members = doc.members.map(function (member) {
        if (member.ref) {
          member.ref = names[member.ref]
          return member
        }
        else return names[member]
      })
    }
    if (doc.changeset) {
      doc.changeset = names[doc.changeset]
    }

    if (doc.d) {
      osm.del(names[doc.d], function (err, node) {
        if (err) return done(err)
        versions[key] = node.key
        nodes[doc.d] = node
        next()
      })
    } else if (doc.m) {
      doc.v.refs = doc.v.refs.map(function (ref) { return names[ref] })
      osm.put(names[doc.m], doc.v, function (err, node) {
        if (err) return done(err)
        versions[key] = node.key
        nodes[names[doc.m]] = node
        next()
      })
    } else {
      osm.create(doc, function (err, k, node) {
        if (err) return done(err)
        names[key] = k
        versions[key] = node.key
        nodes[k] = node
        next()
      })
    }
  })()
}
