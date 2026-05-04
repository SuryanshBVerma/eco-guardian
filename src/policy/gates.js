'use strict'

const { SEVERITY_ORDER } = require('../config/constants')

function toSeverityRank (input) {
  const key = String(input || '').toLowerCase()
  return SEVERITY_ORDER[key] || 0
}

function summarize (findings) {
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 }
  for (const finding of findings || []) {
    const key = String(finding.severity || '').toLowerCase()
    if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1
  }
  return counts
}

function evaluatePolicy (findings, options = {}) {
  const threshold = options.failOnSeverity
    ? String(options.failOnSeverity).toLowerCase()
    : null
  const maxCritical =
    typeof options.maxCritical === 'number' ? options.maxCritical : null
  const maxHigh = typeof options.maxHigh === 'number' ? options.maxHigh : null

  const enabled = !!(threshold || maxCritical !== null || maxHigh !== null)
  const counts = summarize(findings || [])
  const violations = []

  if (threshold) {
    const limit = toSeverityRank(threshold)
    const hasThresholdViolation = (findings || []).some(
      (f) => toSeverityRank(f.severity) >= limit
    )
    if (hasThresholdViolation) {
      violations.push(`fail-on-severity:${threshold}`)
    }
  }

  if (maxCritical !== null && counts.critical > maxCritical) {
    violations.push(`max-critical:${counts.critical}>${maxCritical}`)
  }

  if (maxHigh !== null && counts.high > maxHigh) {
    violations.push(`max-high:${counts.high}>${maxHigh}`)
  }

  return {
    enabled,
    passed: violations.length === 0,
    violations,
    counts
  }
}

module.exports = {
  evaluatePolicy
}
