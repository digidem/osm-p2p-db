var convert = require('base-convertor')

module.exports = function hex2dec (hex) {
  return convert(hex.toUpperCase(), '0123456789ABCDEF', '0123456789')
}
