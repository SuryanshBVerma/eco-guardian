'use strict'

const fsp = require('fs/promises')
const path = require('path')

const { log } = require('../cli/output')

async function loadBaseline (filePath, options = {}) {
  if (!filePath) return []
  const absPath = path.resolve(process.cwd(), filePath)
  try {
    const content = await fsp.readFile(absPath, 'utf8')
    const baseline = JSON.parse(content)
    return Array.isArray(baseline) ? baseline : []
  } catch (readError) {
    if (readError instanceof SyntaxError) {
      if (options.strictBaseline && options.baselineExplicit) {
        throw new Error(
          `Baseline file "${filePath}" contains invalid JSON and strict mode is enabled.`
        )
      }
      log(
        'warn',
        `Baseline file "${filePath}" exists but contains invalid JSON. Suppression disabled.`,
        options
      )
      return []
    }

    // Missing file is silent unless it was an explicit --baseline flag
    if (
      readError.code === 'ENOENT' &&
      options.strictBaseline &&
      options.baselineExplicit
    ) {
      throw new Error(
        `Baseline file "${filePath}" was explicitly provided but not found (strict baseline mode).`
      )
    }
    if (readError.code !== 'ENOENT') {
      if (options.strictBaseline && options.baselineExplicit) {
        throw new Error(
          `Failed to read baseline file "${filePath}" in strict mode: ${readError.message}`
        )
      }
      log(
        'warn',
        `Failed to read baseline file "${filePath}": ${readError.message}`,
        options
      )
    }
    return []
  }
}

function applyBaseline (findings, baseline) {
  if (!baseline || baseline.length === 0) {
    return { findings, suppressedCount: 0 }
  }

  const now = new Date()
  const visible = []
  let suppressedCount = 0

  for (const finding of findings) {
    const match = baseline.find((b) => {
      if (b.status === 'disabled') return false
      // Basic match
      if (b.ecosystem !== finding.ecosystem) return false
      if (b.package !== finding.package) return false
      if (b.advisory_id !== finding.advisory_id) return false
      if (b.version && b.version !== finding.version) return false

      // Optional: Manifest path substring match
      if (b.manifest_path_contains) {
        const hasMatch = finding.found_in.some((loc) =>
          (loc.manifest_path || loc.project || '').includes(
            b.manifest_path_contains
          )
        )
        if (!hasMatch) return false
      }

      // Optional: Expiry
      if (b.expires_on) {
        const expiry = new Date(b.expires_on)
        if (now > expiry) return false // Expired, so don't suppress
      }

      return true
    })

    if (match) {
      suppressedCount++
    } else {
      visible.push(finding)
    }
  }

  return { findings: visible, suppressedCount }
}

async function writeBaseline (findings, filePath) {
  if (!filePath) return
  const absPath = path.resolve(process.cwd(), filePath)

  // We only store core fields to keep it stable
  const baseline = findings.map((f) => ({
    ecosystem: f.ecosystem,
    package: f.package,
    version: f.version,
    advisory_id: f.advisory_id,
    reason: 'Auto-generated from current findings',
    owner: null,
    ticket: null,
    approved_by: null,
    approved_at: null,
    status: 'active',
    expires_on: null
  }))

  // Deduplicate
  const unique = []
  const seen = new Set()
  for (const item of baseline) {
    const key = `${item.ecosystem}|${item.package}|${item.version}|${item.advisory_id}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  await fsp.writeFile(absPath, JSON.stringify(unique, null, 2), 'utf8')
}

module.exports = {
  loadBaseline,
  applyBaseline,
  writeBaseline
}
