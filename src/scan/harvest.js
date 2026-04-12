'use strict'

const fsp = require('fs/promises')
const path = require('path')
const {
  DISCOVERY_CONCURRENCY,
  PACKAGE_READ_CONCURRENCY
} = require('../config/constants')
const { asyncPool } = require('../shared/async')
const { log } = require('../cli/output')

async function readPackageJson (packageDir) {
  const file = path.join(packageDir, 'package.json')
  let raw
  try {
    raw = await fsp.readFile(file, 'utf8')
  } catch (error) {
    if (
      error &&
      (error.code === 'ENOENT' ||
        error.code === 'ENOTDIR' ||
        error.code === 'EACCES' ||
        error.code === 'EPERM')
    ) { return null }
    return null
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (_) {
    return null
  }
  if (
    !parsed ||
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'string' ||
    !parsed.name ||
    !parsed.version
  ) { return null }
  return { name: parsed.name, version: parsed.version }
}

async function listPackagesUnderNodeModules (nodeModulesDir) {
  let entries
  try {
    entries = await fsp.readdir(nodeModulesDir, { withFileTypes: true })
  } catch (_) {
    return []
  }

  const packageDirs = []
  for (const entry of entries) {
    if (!entry.isDirectory || !entry.isDirectory()) continue
    if (entry.isSymbolicLink && entry.isSymbolicLink()) continue

    if (entry.name.startsWith('@')) {
      let scoped
      try {
        scoped = await fsp.readdir(path.join(nodeModulesDir, entry.name), {
          withFileTypes: true
        })
      } catch (_) {
        continue
      }
      for (const scopedEntry of scoped) {
        if (!scopedEntry.isDirectory || !scopedEntry.isDirectory()) continue
        if (scopedEntry.isSymbolicLink && scopedEntry.isSymbolicLink()) { continue }
        packageDirs.push(
          path.join(nodeModulesDir, entry.name, scopedEntry.name)
        )
      }
      continue
    }

    packageDirs.push(path.join(nodeModulesDir, entry.name))
  }

  return packageDirs
}

async function harvestNpmPackages (nodeModulesDirs, options, state) {
  const packageMap = new Map()
  let totalEntries = 0

  await asyncPool(DISCOVERY_CONCURRENCY, nodeModulesDirs, async (nmDir) => {
    const packageDirs = await listPackagesUnderNodeModules(nmDir)
    totalEntries += packageDirs.length

    await asyncPool(PACKAGE_READ_CONCURRENCY, packageDirs, async (pkgDir) => {
      const pkg = await readPackageJson(pkgDir)
      if (!pkg) return
      const key = `npm|${pkg.name}|${pkg.version}`
      const existing = packageMap.get(key)
      if (!existing) {
        packageMap.set(key, {
          key,
          ecosystem: 'npm',
          name: pkg.name,
          version: pkg.version,
          osvEcosystem: 'npm',
          paths: [pkgDir],
          occurrences: []
        })
      } else existing.paths.push(pkgDir)
    })
  })

  log(
    'info',
    `Harvested ${totalEntries.toLocaleString()} package entries -> ${packageMap.size.toLocaleString()} unique name@version pairs`,
    options
  )
  if (packageMap.size > 50000) {
    log(
      'warn',
      `Large scan detected (${packageMap.size.toLocaleString()} unique packages). This may take longer.`,
      options
    )
  }
  state.packageMap = packageMap
  return packageMap
}

module.exports = {
  readPackageJson,
  harvestNpmPackages,
  harvestPackages: harvestNpmPackages
}
