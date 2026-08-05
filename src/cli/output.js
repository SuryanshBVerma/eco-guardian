'use strict'

const { COLORS, LEVEL_META } = require('../config/constants')
const { colorize } = require('./output-utils')

function printScanScope (options) {
  const isGlobal = Boolean(options.global || options.allDrives || options.globalOnly)
  const scope = isGlobal ? 'GLOBAL' : 'LOCAL'
  const target = isGlobal ? 'system roots' : process.cwd()
  process.stderr.write(`[INFO] Scan scope: ${scope} (${target})\n`)
}

function printBanner (options) {
  if (options.json) return
  const now = new Date()
  const isMidnight = now.getHours() === 0 && now.getMinutes() === 0

  if (isMidnight) {
    const glitch = [
      '  V   I   G   I   L   A   N   T  ',
      '01010101 01100111 01101001 01101100',
      '  T   H   E      G   U   A   R   D  '
    ]
    process.stderr.write(`${colorize(COLORS.red, glitch.join('\n'))}\n`)
    return
  }

  const lines = [
    '01000101 01100011 01101111 00100000 01000111 01110101 01100001 01110010 01100100 01101001 01100001 01101110'
  ]
  process.stderr.write(`${colorize(COLORS.cyan, lines.join('\n'))}\n`)
}

function log (level, message, options) {
  if (options && options.json) return
  const musing = require('./musing')
  if (musing.isActive) {
    musing.clear()
  }
  const meta = LEVEL_META[level] || LEVEL_META.info
  process.stderr.write(`${colorize(meta.color, meta.icon)} ${message}\n`)
  if (musing.isActive) {
    musing.draw()
  }
}

module.exports = {
  colorize,
  printBanner,
  printScanScope,
  log,
  musing: require('./musing')
}
