'use strict'

const shared = require('./shared')
const path = require('path')

async function resolveSwiftPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Swift graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Swift graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await shared.execTool('swift', ['package', 'show-dependencies', '--format', 'json'], { cwd: root, timeoutMs: 120000 })
        const data = JSON.parse(stdout)

        // swift package show-dependencies --format json output:
        // { "name": "...", "dependencies": [...] }
        function walk (deps, depth) {
          if (!Array.isArray(deps)) return
          for (const dep of deps) {
            const name = dep.name || dep.identity
            const version = dep.version || (dep.state && dep.state.version)
            if (name && version) {
              const pkg = shared.createGraphPackage(
                'swift',
                name,
                version,
                [`${name}@${version}`],
                depth + 1
              )
              const key = pkg.key
              const existing = packageMap.get(key)
              if (!existing) {
                pkg.paths.push(root)
                pkg.occurrences.push({
                  project: path.basename(root),
                  manifest_path: path.join(root, 'Package.swift'),
                  dependency_type: depth === 0 ? 'direct' : 'transitive'
                })
                packageMap.set(key, pkg)
              } else {
                existing.paths.push(root)
              }
            }
            if (dep.dependencies) walk(dep.dependencies, depth + 1)
          }
        }

        walk(data.dependencies || [], 0)
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nSwift resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveSwiftPackages }
