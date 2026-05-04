'use strict'

const { enrichNpmLocations } = require('./location')
const {
  pickBestFixedVersion,
  buildFixSteps,
  fixStepsToDisplayCommands
} = require('./fix')
const { generateRemediationHint } = require('./remediation')

/**
 * Builds structured finding objects from harvested packages and vulnerability data.
 * Enriches with fix commands, remediation hints, and location metadata.
 *
 * @param {Map} packageMap - Harvested packages.
 * @param {object} vulnerabilityMap - Results from queryVulnerabilities.
 * @param {object} state - Runtime state (used for global root path).
 * @returns {Promise<object[]>}
 */
async function buildFindings (packageMap, vulnerabilityMap, state) {
  const findings = []
  const globalRoot = state.globalRoot || null

  for (const [key, record] of Object.entries(vulnerabilityMap)) {
    if (
      !record ||
      !record.vulnerable ||
      !Array.isArray(record.advisories) ||
      record.advisories.length === 0
    ) {
      continue
    }
    const pkg = packageMap.get(key)
    if (!pkg) continue

    const foundIn =
      pkg.ecosystem === 'npm' && pkg.resolution_mode !== 'graph'
        ? await enrichNpmLocations(pkg.paths, pkg.name, globalRoot)
        : pkg.occurrences || []

    const fixedVersion = pickBestFixedVersion(record.advisories)
    const fixSteps = buildFixSteps({
      ecosystem: pkg.ecosystem,
      foundIn,
      packageName: pkg.name,
      fixedVersion
    })
    const fixCommands = fixStepsToDisplayCommands(fixSteps)
    const fixCommand =
      fixCommands.length === 0
        ? null
        : fixCommands.length === 1
          ? fixCommands[0]
          : `${fixCommands[0]} (+${fixCommands.length - 1} more)`

    const remediationHint = generateRemediationHint({
      ecosystem: pkg.ecosystem,
      packageName: pkg.name,
      fixedVersion,
      foundIn
    })

    for (const advisory of record.advisories) {
      findings.push({
        fingerprint: `${pkg.ecosystem}|${pkg.name}|${pkg.version}|${advisory.id}`,
        ecosystem: pkg.ecosystem,
        package: pkg.name,
        version: pkg.version,
        source: advisory.source || 'osv',
        match_confidence: advisory.match_confidence || null,
        resolution_mode: pkg.resolution_mode || 'inventory',
        resolved_path: pkg.resolved_path || null,
        depth: typeof pkg.depth === 'number' ? pkg.depth : null,
        fixed_version: fixedVersion,
        remediation_hint: remediationHint,
        severity: advisory.severity,
        cvss: advisory.cvss_score,
        advisory_id: advisory.id,
        cve: advisory.cve || null,
        title: advisory.title,
        found_in: foundIn,
        fix_steps: fixSteps,
        fix_commands: fixCommands,
        fix_command: fixCommand,
        references: advisory.references || []
      })
    }
  }

  return findings
}

module.exports = {
  buildFindings
}
