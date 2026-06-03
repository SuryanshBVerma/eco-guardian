'use strict'

const { stableFindingId } = require('../shared/ids')

function buildExposureFinding (pkg, entry, matchedVersion, scanContext) {
  const finding = {
    fingerprint: `exposure|${pkg.ecosystem}|${pkg.name}|${matchedVersion}|${entry.id}`,
    ecosystem: pkg.ecosystem,
    package: pkg.name,
    version: matchedVersion,
    source: 'exposure-catalog',
    match_confidence: 'high',
    resolution_mode: pkg.resolution_mode || 'inventory',
    resolved_path: pkg.resolved_path || null,
    depth: typeof pkg.depth === 'number' ? pkg.depth : null,
    fixed_version: null,
    remediation_hint: `Package "${pkg.name}@${matchedVersion}" matches exposure catalog entry "${entry.id}". Remove or update immediately.`,
    severity: entry.severity || 'critical',
    cvss: null,
    advisory_id: entry.id,
    cve: null,
    title: entry.name || `Exposure: ${entry.id}`,
    found_in: pkg.occurrences || [],
    fix_steps: [],
    fix_commands: [],
    fix_command: null,
    references: []
  }

  if (scanContext) {
    finding.finding_id = stableFindingId(finding, scanContext)
    finding.run_id = scanContext.runId
    finding.scan_profile = scanContext.profile || 'legacy'
  }

  return finding
}

function matchExposureCatalog (packageMap, catalog, options, scanContext) {
  const findings = []
  const index = catalog.index

  if (!index || index.size === 0) return findings

  for (const [, pkg] of packageMap.entries()) {
    const ecosystem = String(pkg.ecosystem).toLowerCase()
    const packageName = String(pkg.name).toLowerCase()
    const version = String(pkg.version)

    const key = `${ecosystem}|${packageName}|${version}`
    const entries = index.get(key)

    if (entries) {
      for (const entry of entries) {
        const finding = buildExposureFinding(pkg, entry, version, scanContext)
        findings.push(finding)
      }
    }
  }

  return findings
}

module.exports = {
  matchExposureCatalog,
  buildExposureFinding
}
