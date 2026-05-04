'use strict'

const shared = require('./shared')
const path = require('path')

async function resolveRubyPackages (roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require('../config/constants')
  const { asyncPool } = require('../shared/async')
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]
  const total = rootsArray.length
  let resolvedCount = 0

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Ruby graphs for ${total} directories...\n`
    )
  }

  const timer =
    total > 1
      ? setInterval(() => {
        process.stderr.write(
            `\r Resolving Ruby graphs... ${resolvedCount}/${total}`
        )
      }, 200)
      : null

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const rubyScript =
          'require "bundler"; Bundler.load.specs.each{|s| puts "#{s.name} #{s.version}"}'
        const stdout = await shared.execAsync(`ruby -e '${rubyScript}'`, {
          cwd: root,
          timeout: 120000
        })
        const lines = stdout.split(/\r?\n/).filter(Boolean)

        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          if (parts.length < 2) continue
          const version = parts.pop()
          const name = parts.join(' ')

          const pkg = shared.createGraphPackage(
            'ruby',
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
              manifest_path: path.join(root, 'Gemfile.lock'),
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
            `\nRuby resolution failed for ${root}: ${err.message}\n`
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

module.exports = { resolveRubyPackages }
