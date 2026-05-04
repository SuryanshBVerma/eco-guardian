'use strict'

const fsp = require('fs/promises')
const path = require('path')
const {
  PACKAGE_READ_CONCURRENCY,
  HASKELL_MANIFEST_NAMES
} = require('../config/constants')
const { asyncPool } = require('../shared/async')
const { log } = require('../cli/output')
const { discoverManifestFiles } = require('./discovery')

function parseStackLock (content, filePath) {
  const records = []
  const lines = content.split(/\r?\n/)

  let inPackages = false
  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === 'packages:' || trimmed === 'packages: []') {
      inPackages = true
      continue
    }
    if (!inPackages) continue

    // Exit packages section only on non-list top-level keys
    if (
      trimmed &&
      !trimmed.startsWith('-') &&
      !line.startsWith('  ') &&
      !line.startsWith('\t') &&
      trimmed.endsWith(':')
    ) {
      inPackages = false
      continue
    }

    // Package entries in stack.yaml.lock look like:
    //   - completed:
    //       hackage: package-name-1.2.3@sha256:abc...
    //       pantry-tree:
    //         sha256: ...
    //         size: 1234
    const hackageMatch = trimmed.match(/^hackage:\s+(\S+)-(\d[\d.]*)\b/)
    if (hackageMatch) {
      records.push(
        createHaskellRecord(
          hackageMatch[1],
          hackageMatch[2],
          filePath,
          'stack.yaml.lock'
        )
      )
    }
  }
  return records
}

function parseCabalFreeze (content, filePath) {
  const records = []
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('--')) continue

    // Format: constraints: package ==version,
    // or package ==version
    const match = trimmed.match(/^constraints:\s*(.+?)\s*==\s*(\S+),?\s*$/)
    if (match) {
      records.push(
        createHaskellRecord(
          match[1],
          match[2].replace(/,+$/, ''),
          filePath,
          'cabal.project.freeze'
        )
      )
      continue
    }
    const simpleMatch = trimmed.match(/^(\S+)\s*==\s*(\S+)\s*,?\s*$/)
    if (simpleMatch && !trimmed.startsWith('constraints:')) {
      records.push(
        createHaskellRecord(
          simpleMatch[1],
          simpleMatch[2].replace(/,+$/, ''),
          filePath,
          'cabal.project.freeze'
        )
      )
    }
  }
  return records
}

function createHaskellRecord (name, version, filePath, rawSource) {
  return {
    key: `haskell|${name}|${version}`,
    ecosystem: 'haskell',
    name,
    version,
    osvEcosystem: 'Hackage',
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

async function collectHaskellPackages (roots, options, state) {
  const packageMap = new Map()
  const counters = { found: 0, skippedPermissions: 0 }

  const manifestDirs = await discoverManifestFiles(
    roots,
    HASKELL_MANIFEST_NAMES,
    options,
    counters,
    'Haskell manifests'
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
      if (file === 'stack.yaml.lock') {
        let raw
        try {
          raw = await fsp.readFile(filePath, 'utf8')
        } catch (_) {
          continue
        }
        records.push(...parseStackLock(raw, filePath))
      } else if (file === 'cabal.project.freeze') {
        let raw
        try {
          raw = await fsp.readFile(filePath, 'utf8')
        } catch (_) {
          continue
        }
        records.push(...parseCabalFreeze(raw, filePath))
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
    `Harvested ${totalEntries.toLocaleString()} Haskell dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options
  )
  return packageMap
}

module.exports = {
  parseStackLock,
  parseCabalFreeze,
  collectHaskellPackages
}
