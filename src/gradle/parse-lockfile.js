'use strict'

const path = require('path')

/**
 * Parses Gradle lockfiles (gradle.lockfile or buildscript-gradle.lockfile).
 */
function parseGradleLockfile (content, filePath) {
  const records = []
  const lines = content.split(/\r?\n/)

  for (let line of lines) {
    line = line.trim()
    if (!line || line.startsWith('#') || line === 'empty=') continue

    // Format: group:name:version=config1,config2...
    const parts = line.split('=')
    const gav = parts[0].trim()
    const configs = parts[1] ? parts[1].split(',').map((c) => c.trim()) : []

    const gavParts = gav.split(':')
    if (gavParts.length === 3) {
      const [g, a, v] = gavParts
      records.push({
        group: g,
        name: a,
        version: v,
        configurations: configs,
        source: path.basename(filePath)
      })
    }
  }
  return records
}

module.exports = { parseGradleLockfile }
