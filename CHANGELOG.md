# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

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
