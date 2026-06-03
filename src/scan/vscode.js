'use strict'

const fsp = require('fs/promises')
const path = require('path')
const os = require('os')
const { PACKAGE_READ_CONCURRENCY } = require('../config/constants')
const { asyncPool } = require('../shared/async')
const { log } = require('../cli/output')

/**
 * Returns the default VSCode extensions directory for the current platform.
 */
function getDefaultVSCodeExtensionsDir () {
  const home = os.homedir()
  if (process.platform === 'win32') {
    return path.join(home, '.vscode', 'extensions')
  }
  return path.join(home, '.vscode', 'extensions')
}

/**
 * Normalizes extension name to publisher.name as expected by OSV
 */
function getOSVPackageName (manifest) {
  if (manifest.publisher && manifest.name) {
    return `${manifest.publisher}.${manifest.name}`
  }
  return manifest.name
}

async function collectVSCodeExtensions (roots, options, state) {
  const packageMap = new Map()
  const extensionsDirs = []

  // If path was explicitly provided, we look there.
  // Otherwise we look in the default VSCode extensions directory.
  if (options.pathExplicit) {
    extensionsDirs.push(path.resolve(options.path))
  } else {
    extensionsDirs.push(getDefaultVSCodeExtensionsDir())
  }

  let totalFound = 0

  for (const extensionsDir of extensionsDirs) {
    let entries
    try {
      entries = await fsp.readdir(extensionsDir, { withFileTypes: true })
    } catch (error) {
      if (options.verbose) {
        log(
          'info',
          `Could not read extensions directory: ${extensionsDir}`,
          options
        )
      }
      continue
    }

    const candidateDirs = entries
      .filter((d) => d.isDirectory())
      .map((d) => path.join(extensionsDir, d.name))

    await asyncPool(PACKAGE_READ_CONCURRENCY, candidateDirs, async (dir) => {
      const pkgPath = path.join(dir, 'package.json')
      try {
        const content = await fsp.readFile(pkgPath, 'utf8')
        const manifest = JSON.parse(content)

        // VSCode extensions must have name, version, and engines.vscode
        if (
          manifest.name &&
          manifest.version &&
          manifest.engines &&
          manifest.engines.vscode
        ) {
          const name = getOSVPackageName(manifest)
          const version = manifest.version
          const key = `vscode|${name}|${version}`

          if (!packageMap.has(key)) {
            packageMap.set(key, {
              key,
              ecosystem: 'vscode',
              name,
              version,
              osvEcosystem: 'VSCode',
              paths: [dir],
              occurrences: [
                {
                  project: extensionsDir,
                  manifest_path: pkgPath,
                  dependency_type: 'direct',
                  raw_source: 'package.json'
                }
              ]
            })
            totalFound++
          } else {
            const record = packageMap.get(key)
            record.paths.push(dir)
            record.occurrences.push({
              project: extensionsDir,
              manifest_path: pkgPath,
              dependency_type: 'direct',
              raw_source: 'package.json'
            })
          }
        }
      } catch (err) {
        // Skip invalid or unreadable package.json
      }
    })
  }

  log(
    'info',
    `Harvested ${totalFound.toLocaleString()} VSCode extensions`,
    options
  )
  return packageMap
}

module.exports = {
  collectVSCodeExtensions
}
