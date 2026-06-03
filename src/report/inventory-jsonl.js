'use strict'

const fsp = require('fs/promises')
const path = require('path')
const { stablePackageId, stableFindingId, stableSummaryId } = require('../shared/ids')

function buildPackageRecord (pkg, scanContext) {
  const recordId = stablePackageId(pkg, scanContext)
  return {
    record_type: 'package',
    record_id: recordId,
    run_id: scanContext.runId,
    schema_version: scanContext.schemaVersion,
    timestamp: new Date().toISOString(),
    ecosystem: pkg.ecosystem,
    name: pkg.name,
    version: pkg.version,
    osv_ecosystem: pkg.osvEcosystem || null,
    resolution_mode: pkg.resolution_mode || 'inventory',
    depth: typeof pkg.depth === 'number' ? pkg.depth : null,
    paths: pkg.paths || [],
    occurrences: (pkg.occurrences || []).map((o) => ({
      project: o.project || null,
      manifest_path: o.manifest_path || null,
      dependency_type: o.dependency_type || 'unknown',
      parent: o.parent || null
    }))
  }
}

function buildFindingRecord (finding, scanContext) {
  const recordId = stableFindingId(finding, scanContext)
  return {
    record_type: 'finding',
    record_id: recordId,
    run_id: scanContext.runId,
    schema_version: scanContext.schemaVersion,
    timestamp: new Date().toISOString(),
    ecosystem: finding.ecosystem,
    package: finding.package,
    version: finding.version,
    advisory_id: finding.advisory_id,
    cve: finding.cve || null,
    severity: finding.severity,
    cvss: finding.cvss || null,
    title: finding.title || null,
    source: finding.source || 'osv',
    match_confidence: finding.match_confidence || null,
    resolution_mode: finding.resolution_mode || 'inventory',
    fixed_version: finding.fixed_version || null,
    fingerprint: finding.fingerprint || null
  }
}

function buildScanSummaryRecord (scanContext, result) {
  const recordId = stableSummaryId(scanContext)
  return {
    record_type: 'scan_summary',
    record_id: recordId,
    run_id: scanContext.runId,
    schema_version: scanContext.schemaVersion,
    timestamp: new Date().toISOString(),
    started_at: scanContext.startedAt,
    completed_at: new Date().toISOString(),
    status: scanContext.status || 'complete',
    profile: scanContext.profile,
    roots: scanContext.roots || [],
    options: scanContext.options || {},
    package_count: result ? result.packageCount : 0,
    finding_count: result ? (result.findings || []).length : 0,
    exit_code: result ? result.exitCode : 0,
    policy: result ? result.policy : null
  }
}

async function writeInventoryJsonl (packageMap, options, context) {
  if (!options.exportInventoryJsonl) return null
  const outFile = path.resolve(process.cwd(), options.exportInventoryJsonl)

  const lines = []

  for (const [, pkg] of packageMap.entries()) {
    const record = buildPackageRecord(pkg, context)
    lines.push(JSON.stringify(record))
  }

  if (context.result && context.result.findings) {
    for (const finding of context.result.findings) {
      const record = buildFindingRecord(finding, context)
      lines.push(JSON.stringify(record))
    }
  }

  const summary = buildScanSummaryRecord(context, context.result)
  lines.push(JSON.stringify(summary))

  await fsp.writeFile(outFile, lines.join('\n') + '\n', 'utf8')
  return outFile
}

module.exports = {
  writeInventoryJsonl,
  buildPackageRecord,
  buildFindingRecord,
  buildScanSummaryRecord
}
