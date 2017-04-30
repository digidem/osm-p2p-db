# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## [4.0.0] - 2016-04-30
### Added
- **BREAKING CHANGE** Deleted documents are now surfaced through the API
- Upgraded hyperkv to 2.0.1
### Fixed
- Blank, empty deleted points ("ghost points") no longer appear on the map due
  to floating point rounding errors
- Clarifications to the `getChanges` API docs
- Some indexing inner loop optimizations
- All of a doc's parents' refs are deleted before adding new refs
- `osm.ready()` won't fire now until all indexes (now including the changeset
  index) are finished
- Added `osm.ready()` to the API docs

## [3.11.0] - 2016-12-02
### Added
- Generate new document keys in batch() if not provided
### Fixed
- Update terminology in README to be consistent

## [3.10.0] - 2016-09-04
### Added
- `opts.kv` to pass in a hyperkv instance

## [3.9.3] - 2016-08-18
### Fixed
- fix in `_onpt` reference calculation to ensure that all nodes referred to by
  ways are returned correctly

## [3.9.2] - 2016-08-02
### Fixed
- always return the most current versions of documents in bounding box queries
