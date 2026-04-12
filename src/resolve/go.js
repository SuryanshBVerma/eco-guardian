'use strict'

const { execAsync, createGraphPackage } = require('./shared')
const path = require('path')

async function resolveGoPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Go graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Go graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const graphStdout = await execAsync(
          'go mod graph',
          { cwd: root }
        )
        const listStdout = await execAsync(
          'go list -m -json all',
          { cwd: root }
        )

        const versions = new Map()
        const modules = listStdout
          .split('\n}\n')
          .filter(Boolean)
          .map((s) => JSON.parse(s + (s.endsWith('}') ? '' : '}')))
        for (const mod of modules) {
          if (mod.Version) versions.set(mod.Path, mod.Version)
        }

        const relations = graphStdout
          .split('\n')
          .filter(Boolean)
          .map((l) => l.split(' '))
        const mainMod = modules[0]?.Path

        const buildPath = (target, visited = new Set()) => {
          if (target === mainMod) return []
          if (visited.has(target)) return [target] // Cycle break
          visited.add(target)

          for (const [parent, child] of relations) {
            const childPath = child.split('@')[0]
            if (childPath === target) {
              const pPath = parent.split('@')[0]
              return [
                ...buildPath(pPath, visited),
                `${target}@${versions.get(target) || 'unknown'}`
              ]
            }
          }
          return [`${target}@${versions.get(target) || 'unknown'}`]
        }

        for (const mod of modules) {
          if (mod.Main || !mod.Version) continue
          const resolvedPath = buildPath(mod.Path)
          const pkg = createGraphPackage(
            'go',
            mod.Path,
            mod.Version,
            resolvedPath,
            resolvedPath.length
          )
          const key = pkg.key

          const existing = packageMap.get(key)
          if (!existing) {
            pkg.paths.push(root)
            pkg.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, 'go.mod'),
              dependency_type:
                resolvedPath.length === 1 ? 'direct' : 'transitive'
            })
            packageMap.set(key, pkg)
          } else {
            existing.paths.push(root)
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nGo resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveGoPackages }
