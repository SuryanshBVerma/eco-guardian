'use strict'

const { execAsync, createGraphPackage } = require('./shared')
const path = require('path')

async function resolveNpmPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool, nowMs, hrSeconds } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving npm graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving npm graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await require('./shared')
          .execAsync('npm ls --all --json', { cwd: root })
          .catch((err) => {
            if (err.stdout && err.stdout.trim().startsWith('{')) { return err.stdout }
            throw err
          })
        let tree
        try {
          tree = JSON.parse(stdout)
        } catch (e) {
          if (options.verbose) {
            process.stderr.write(
              `\nFailed to parse JSON for ${root}: ${e.message}\n`
            )
          }
          return
        }

        const walk = (dependencies, parentPath = [], depth = 0) => {
          if (!dependencies) return
          for (const [name, info] of Object.entries(dependencies)) {
            if (!info || typeof info !== 'object') continue
            const version = info.version
            if (!version) continue

            const currentPath = [...parentPath, `${name}@${version}`]
            const pkg = createGraphPackage(
              'npm',
              name,
              version,
              currentPath,
              depth + 1
            )
            const key = pkg.key

            const parentStr = parentPath[parentPath.length - 1] // e.g., "vite@4.5.14"
            const parent = parentStr
              ? {
                  name: parentStr.split('@')[0],
                  version: parentStr.split('@').slice(1).join('@')
                }
              : null

            const existing = packageMap.get(key)
            if (!existing) {
              pkg.paths.push(root)
              pkg.occurrences.push({
                project: path.basename(root),
                manifest_path: path.join(root, 'package.json'),
                dependency_type: depth === 0 ? 'direct' : 'transitive',
                parent
              })
              packageMap.set(key, pkg)
            } else {
              existing.paths.push(root)
              // Check if we already have this parent for this project to avoid duplicates
              const alreadyHasParent = existing.occurrences.some(
                (o) =>
                  o.project === path.basename(root) &&
                  o.parent?.name === parent?.name
              )
              if (!alreadyHasParent) {
                existing.occurrences.push({
                  project: path.basename(root),
                  manifest_path: path.join(root, 'package.json'),
                  dependency_type: depth === 0 ? 'direct' : 'transitive',
                  parent
                })
              }
            }
            if (info.dependencies) {
              walk(info.dependencies, currentPath, depth + 1)
            }
          }
        }

        if (tree && tree.dependencies) {
          walk(tree.dependencies)
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nnpm resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveNpmPackages }
