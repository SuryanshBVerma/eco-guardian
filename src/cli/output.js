'use strict'

const { COLORS, LEVEL_META } = require('../config/constants')

function colorize (color, text) {
  return `${color}${text}${COLORS.reset}`
}

function printBanner (options) {
  if (options.json) return
  const lines = [
    '01000101 01100011 01101111 00100000 01000111 01110101 01100001 01110010 01100100 01101001 01100001 01101110'
  ]
  process.stderr.write(`${colorize(COLORS.cyan, lines.join('\n'))}\n`)
}

function log (level, message, options) {
  if (options && options.json) return
  const meta = LEVEL_META[level] || LEVEL_META.info
  process.stderr.write(`${colorize(meta.color, meta.icon)} ${message}\n`)
}

module.exports = {
  colorize,
  printBanner,
  log
}
