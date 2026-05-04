'use strict'

const shared = require('./shared')
const path = require('path')

async function resolveDartPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Dart graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Dart graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await shared.execAsync('dart pub deps --json', {
          cwd: root,
          timeout: 120000
        })
        const data = JSON.parse(stdout)

        if (!data.packages) return
        for (const pkg of data.packages) {
          // Skip the root package (entry with no name or "root" type)
          if (pkg.name === null || pkg.name === undefined) continue
          if (!pkg.version && !pkg.source) continue

          // Version may be in "version" or inferred from source description
          const version =
            pkg.version || (pkg.description && pkg.description.version) || null
          if (!pkg.name || !version) continue

          const pkgRecord = shared.createGraphPackage(
            'dart',
            pkg.name,
            version,
            [`${pkg.name}@${version}`],
            1
          )
          const key = pkgRecord.key
          const existing = packageMap.get(key)
          if (!existing) {
            pkgRecord.paths.push(root)
            pkgRecord.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, 'pubspec.yaml'),
              dependency_type: 'direct'
            })
            packageMap.set(key, pkgRecord)
          } else {
            existing.paths.push(root)
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nDart resolution failed for ${root}: ${err.message}\n`
          )
        }
      } finally {
        resolvedCount++
      }
    })
  } finally {
    if (timer) {
      clearInterval(timer)
      process.stderr.write('\r')
    }
  }

  return packageMap
}

module.exports = { resolveDartPackages }
