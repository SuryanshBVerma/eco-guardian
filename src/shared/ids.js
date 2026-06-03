'use strict'

const crypto = require('crypto')
const { SCAN_SCHEMA_VERSION } = require('../config/constants')

function newRunId () {
  const timestamp = Date.now().toString(36)
  const random = crypto.randomBytes(8).toString('hex')
  return `run_${timestamp}_${random}`
}

function stableId (recordType, parts) {
  const content = parts.filter((p) => p != null).join('|')
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  return `${recordType}:${hash}`
}

function stablePackageId (pkg, context) {
  const parts = [
    pkg.ecosystem || '',
    pkg.name || '',
    pkg.version || ''
  ]
  return stableId('pkg', parts)
}

function stableFindingId (finding, context) {
  const parts = [
    finding.ecosystem || '',
    finding.package || '',
    finding.version || '',
    finding.advisory_id || ''
  ]
  return stableId('finding', parts)
}

function stableSummaryId (context) {
  const parts = [
    context.runId || '',
    String(context.packageCount || 0),
    String(context.findingCount || 0)
  ]
  return stableId('summary', parts)
}

function createScanContext (options) {
  return {
    runId: newRunId(),
    schemaVersion: SCAN_SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    profile: options.profile || 'legacy',
    roots: [],
    status: 'running',
    options: {
      ecosystems: options.ecosystems || [],
      graphResolution: options.graphResolution || false,
      severity: options.severity || 'low'
    }
  }
}

module.exports = {
  newRunId,
  stableId,
  stablePackageId,
  stableFindingId,
  stableSummaryId,
  createScanContext
}
