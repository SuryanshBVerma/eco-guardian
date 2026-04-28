'use strict'

const fsp = require('fs/promises')
const path = require('path')
const {
  PACKAGE_READ_CONCURRENCY,
  SWIFT_MANIFEST_NAMES
} = require('../config/constants')
const { asyncPool } = require('../shared/async')
const { log } = require('../cli/output')
const { discoverManifestFiles } = require('./discovery')

function parsePackageResolved (content, filePath) {
  const records = []
  let data
  try {
    data = JSON.parse(content)
  } catch (_) {
    return records
  }

  // Package.resolved format (Swift 5.x):
  // { "object": { "pins": [...] }, "version": 1 }
  // or { "pins": [...] }
  const pins = (data.object && data.object.pins) || data.pins || []

  for (const pin of pins) {
    const name = pin.identity || pin.package
    const version = (pin.state && pin.state.version) || pin.version || null
    if (name && version) {
      records.push(
        createSwiftRecord(name, version, filePath, 'Package.resolved')
      )
    }
  }
  return records
}

function createSwiftRecord (name, version, filePath, rawSource) {
  return {
    key: `swift|${name}|${version}`,
    ecosystem: 'swift',
    name,
    version,
    osvEcosystem: 'SwiftURL',
    paths: [],
    occurrences: [
      {
        project: path.dirname(filePath),
        manifest_path: filePath,
        dependency_type: 'direct',
        raw_source: rawSource
      }
    ]
  }
}

async function collectSwiftPackages (roots, options, state) {
  const packageMap = new Map()
  const counters = { found: 0, skippedPermissions: 0 }

  const manifestDirs = await discoverManifestFiles(
    roots,
    SWIFT_MANIFEST_NAMES,
    options,
    counters,
    'Swift manifests'
  )

  let totalEntries = 0

  await asyncPool(PACKAGE_READ_CONCURRENCY, manifestDirs, async (dir) => {
    let files
    try {
      files = await fsp.readdir(dir)
    } catch (_) {
      return
    }

    const records = []
    for (const file of files) {
      const filePath = path.join(dir, file)
      if (file === 'Package.resolved') {
        let raw
        try {
          raw = await fsp.readFile(filePath, 'utf8')
        } catch (_) {
          continue
        }
        records.push(...parsePackageResolved(raw, filePath))
      }
    }

    totalEntries += records.length
    for (const record of records) {
      const existing = packageMap.get(record.key)
      if (!existing) {
        record.paths = [dir]
        packageMap.set(record.key, record)
      } else {
        existing.occurrences.push(...record.occurrences)
        existing.paths.push(dir)
      }
    }
  })

  log(
    'info',
    `Harvested ${totalEntries.toLocaleString()} Swift dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options
  )
  return packageMap
}

module.exports = {
  parsePackageResolved,
  collectSwiftPackages
}
