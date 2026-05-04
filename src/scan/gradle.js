'use strict'

const fsp = require('fs/promises')
const path = require('path')
const {
  PACKAGE_READ_CONCURRENCY,
  GRADLE_BUILD_FILES
} = require('../config/constants')
const { asyncPool } = require('../shared/async')
const { log } = require('../cli/output')
const { discoverGradleProjects } = require('../gradle/discover')
const { parseGradleLockfile } = require('../gradle/parse-lockfile')
const { parseGradleBuild } = require('../gradle/parse-build')

async function collectGradlePackages (roots, options, state) {
  const packageMap = new Map()
  const rootsArray = Array.isArray(roots) ? roots : [roots]

  const projectMap = await discoverGradleProjects(rootsArray)

  let totalEntries = 0

  await asyncPool(
    PACKAGE_READ_CONCURRENCY,
    Array.from(projectMap.keys()),
    async (dir) => {
      const foundFiles = projectMap.get(dir)

      for (const fileName of foundFiles) {
        const filePath = path.join(dir, fileName)
        let content
        try {
          content = await fsp.readFile(filePath, 'utf8')
        } catch (_) {
          continue
        }

        let deps = []
        if (fileName.endsWith('.lockfile')) {
          const locked = parseGradleLockfile(content, filePath)
          deps = locked.map((l) => ({
            key: `gradle|${l.group}:${l.name}|${l.version}`,
            name: `${l.group}:${l.name}`,
            version: l.version,
            osvEcosystem: 'Maven',
            occurrences: [
              {
                project: path.basename(dir),
                manifest_path: filePath,
                dependency_type: 'direct',
                raw_source: fileName,
                line: Number.isInteger(l.line) ? l.line : null
              }
            ]
          }))
        } else if (GRADLE_BUILD_FILES.has(fileName)) {
          const parsed = parseGradleBuild(content, filePath)
          deps = parsed
            .map((p) => {
              if (!p.group || !p.name || !p.version) return null
              return {
                key: `gradle|${p.group}:${p.name}|${p.version}`,
                name: `${p.group}:${p.name}`,
                version: p.version,
                osvEcosystem: 'Maven',
                occurrences: [
                  {
                    project: path.basename(dir),
                    manifest_path: filePath,
                    dependency_type: 'direct',
                    raw_source: fileName,
                    line: Number.isInteger(p.line) ? p.line : null
                  }
                ]
              }
            })
            .filter(Boolean)
        }

        totalEntries += deps.length

        for (const record of deps) {
          const existing = packageMap.get(record.key)
          if (!existing) {
            record.paths = [dir]
            packageMap.set(record.key, record)
          } else {
            existing.occurrences.push(...record.occurrences)
            if (!existing.paths.includes(dir)) {
              existing.paths.push(dir)
            }
          }
        }
      }
    }
  )

  log(
    'info',
    `Harvested ${totalEntries.toLocaleString()} Gradle dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options
  )
  return packageMap
}

module.exports = {
  collectGradlePackages
}
