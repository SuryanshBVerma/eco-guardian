'use strict'

const shared = require('./shared')
const path = require('path')

async function resolveConanPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Conan graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Conan graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await shared.execTool('conan', ['graph', 'info', '.', '--format', 'json'], { cwd: root, timeout: 120000 })
        const data = JSON.parse(stdout)

        const nodes = (data.graph && data.graph.nodes) || data.nodes || {}
        for (const [, node] of Object.entries(nodes)) {
          if (!node || !node.ref) continue
          const ref = node.ref
          const atIdx = ref.indexOf('@')
          const cleanRef = atIdx !== -1 ? ref.substring(0, atIdx) : ref
          const slashIdx = cleanRef.lastIndexOf('/')
          if (slashIdx === -1) continue
          const name = cleanRef.substring(0, slashIdx)
          const version = cleanRef.substring(slashIdx + 1)
          if (!name || !version) continue

          const pkg = shared.createGraphPackage(
            'conan',
            name,
            version,
            [`${name}@${version}`],
            1
          )
          const key = pkg.key
          const existing = packageMap.get(key)
          if (!existing) {
            pkg.paths.push(root)
            pkg.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, 'conanfile.txt'),
              dependency_type: 'direct'
            })
            packageMap.set(key, pkg)
          } else {
            existing.paths.push(root)
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nConan resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveConanPackages }
