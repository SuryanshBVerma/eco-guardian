'use strict'

const shared = require('./shared')
const path = require('path')

async function resolveRustPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Rust graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Rust graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await shared.execTool('cargo', ['metadata', '--format-version', '1', '--no-deps'], { cwd: root, timeoutMs: 120000 })
        const data = JSON.parse(stdout)

        if (!data.packages) return
        for (const pkg of data.packages) {
          // Skip the root package
          if (pkg.id && data.resolve && data.resolve.root === pkg.id) continue
          if (!pkg.name || !pkg.version) continue

          const pkgRecord = shared.createGraphPackage(
            'rust',
            pkg.name,
            pkg.version,
            [`${pkg.name}@${pkg.version}`],
            1
          )
          const key = pkgRecord.key
          const existing = packageMap.get(key)
          if (!existing) {
            pkgRecord.paths.push(root)
            pkgRecord.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, 'Cargo.toml'),
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
            `\nRust resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveRustPackages }
