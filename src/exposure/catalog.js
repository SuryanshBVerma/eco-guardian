'use strict'

const fsp = require('fs/promises')
const path = require('path')
const { SUPPORTED_ECOSYSTEMS, DEFAULT_MAX_CATALOG_SIZE } = require('../config/constants')

function validateExposureCatalogEntry (entry, index) {
  const errors = []

  if (!entry || typeof entry !== 'object') {
    return [`Entry ${index}: must be an object`]
  }

  if (!entry.id || typeof entry.id !== 'string') {
    errors.push(`Entry ${index}: missing or invalid "id"`)
  }

  if (!entry.ecosystem || typeof entry.ecosystem !== 'string') {
    errors.push(`Entry ${index}: missing or invalid "ecosystem"`)
  } else {
    const normalized = entry.ecosystem.toLowerCase()
    if (!SUPPORTED_ECOSYSTEMS.includes(normalized) && normalized !== 'vscode') {
      errors.push(`Entry ${index}: unsupported ecosystem "${entry.ecosystem}"`)
    }
  }

  if (!entry.package || typeof entry.package !== 'string') {
    errors.push(`Entry ${index}: missing or invalid "package"`)
  }

  if (!entry.versions || !Array.isArray(entry.versions) || entry.versions.length === 0) {
    errors.push(`Entry ${index}: missing or empty "versions" array`)
  }

  return errors
}

function validateExposureCatalog (catalog) {
  if (!catalog || typeof catalog !== 'object') {
    return { valid: false, errors: ['Catalog must be a JSON object'] }
  }

  if (!catalog.schema_version || typeof catalog.schema_version !== 'string') {
    return { valid: false, errors: ['Missing or invalid "schema_version"'] }
  }

  if (!catalog.entries || !Array.isArray(catalog.entries)) {
    return { valid: false, errors: ['Missing or invalid "entries" array'] }
  }

  const errors = []
  for (let i = 0; i < catalog.entries.length; i++) {
    const entryErrors = validateExposureCatalogEntry(catalog.entries[i], i)
    errors.push(...entryErrors)
  }

  return { valid: errors.length === 0, errors }
}

function buildCatalogIndex (entries) {
  const index = new Map()

  for (const entry of entries) {
    const ecosystem = String(entry.ecosystem).toLowerCase()
    const packageName = String(entry.package).toLowerCase()

    for (const version of entry.versions) {
      const key = `${ecosystem}|${packageName}|${version}`
      if (!index.has(key)) {
        index.set(key, [])
      }
      index.get(key).push(entry)
    }
  }

  return index
}

function parseExposureCatalog (raw) {
  const catalog = JSON.parse(raw)
  const validation = validateExposureCatalog(catalog)
  if (!validation.valid) {
    const err = new Error(`Invalid exposure catalog: ${validation.errors.join('; ')}`)
    err.validationErrors = validation.errors
    throw err
  }
  return catalog
}

async function loadExposureCatalog (fileOrDir, options = {}) {
  const maxSize = options.maxCatalogSize || DEFAULT_MAX_CATALOG_SIZE
  const resolved = path.resolve(process.cwd(), fileOrDir)

  let stat
  try {
    stat = await fsp.stat(resolved)
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Exposure catalog not found: ${fileOrDir}`)
    }
    throw err
  }

  const allEntries = []

  if (stat.isDirectory()) {
    const files = await fsp.readdir(resolved)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))

    for (const file of jsonFiles) {
      const filePath = path.join(resolved, file)
      const fileStat = await fsp.stat(filePath)
      if (fileStat.size > maxSize) {
        throw new Error(`Catalog file exceeds max size (${maxSize} bytes): ${file}`)
      }
      const raw = await fsp.readFile(filePath, 'utf8')
      const catalog = parseExposureCatalog(raw)
      allEntries.push(...catalog.entries)
    }
  } else {
    if (stat.size > maxSize) {
      throw new Error(`Catalog file exceeds max size (${maxSize} bytes): ${fileOrDir}`)
    }
    const raw = await fsp.readFile(resolved, 'utf8')
    const catalog = parseExposureCatalog(raw)
    allEntries.push(...catalog.entries)
  }

  const index = buildCatalogIndex(allEntries)

  return {
    entries: allEntries,
    index,
    schemaVersion: allEntries.length > 0 ? '0.1.0' : null
  }
}

module.exports = {
  loadExposureCatalog,
  parseExposureCatalog,
  validateExposureCatalog,
  validateExposureCatalogEntry,
  buildCatalogIndex
}
