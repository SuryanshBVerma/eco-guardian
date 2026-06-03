'use strict'

const shared = require('./shared')
const path = require('path')

async function resolveMavenPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Maven graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Maven graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await shared.execTool('mvn', ['dependency:tree', '-DoutputType=text'], { cwd: root, timeoutMs: 120000 })
        const lines = stdout.split('\n')

        const stack = []
        for (const line of lines) {
          const match = line.match(
            /^(\[INFO\]\s+)?([| ]*[+\-\\ ]+)?([^:]+):([^:]+):([^:]+):([^:]+)(:([^:]+))?$/
          )
          if (!match) continue

          const indentStr = match[2] || ''
          const depth = indentStr ? Math.floor(indentStr.length / 3) : 0
          const groupId = match[3]
          const artifactId = match[4]
          const version = match[6]
          const name = `${groupId}:${artifactId}`

          if (depth === 0) continue

          while (stack.length >= depth) stack.pop()
          const currentPath = [
            ...stack.map((s) => `${s.name}@${s.version}`),
            `${name}@${version}`
          ]
          stack.push({ name, version })

          const pkg = shared.createGraphPackage(
            'maven',
            name,
            version,
            currentPath,
            depth
          )
          const key = pkg.key
          const existing = packageMap.get(key)
          if (!existing) {
            pkg.paths.push(root)
            pkg.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, 'pom.xml'),
              dependency_type: depth === 1 ? 'direct' : 'transitive'
            })
            packageMap.set(key, pkg)
          } else {
            existing.paths.push(root)
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nMaven resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveMavenPackages }
