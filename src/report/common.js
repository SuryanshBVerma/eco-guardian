'use strict'

function summarizeSeverities (findings) {
  const out = { critical: 0, high: 0, moderate: 0, low: 0 }
  for (const finding of findings) {
    const key = String(finding.severity || '').toLowerCase()
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] += 1
  }
  return out
}

function escapeHtml (value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function severityClass (value) {
  const key = String(value || '').toLowerCase()
  if (key === 'critical') return 'sev-critical'
  if (key === 'high') return 'sev-high'
  if (key === 'moderate') return 'sev-moderate'
  if (key === 'low') return 'sev-low'
  return 'sev-unknown'
}

function normalizeConfidence (value) {
  const key = String(value || '')
    .toLowerCase()
    .trim()
  if (key === 'high' || key === 'medium' || key === 'low') return key
  return 'unknown'
}

function getFindingConfidence (finding) {
  if (!finding) return 'unknown'
  if (finding.match_confidence) {
    return normalizeConfidence(finding.match_confidence)
  }
  const source = String(finding.source || 'osv').toLowerCase()
  if (source === 'osv' || source === 'npm') return 'high'
  return 'unknown'
}

function formatFindingProvenance (finding) {
  const source = String((finding && finding.source) || 'osv')
  const confidence = getFindingConfidence(finding)
  return `${source} (confidence: ${confidence})`
}

module.exports = {
  summarizeSeverities,
  escapeHtml,
  severityClass,
  getFindingConfidence,
  formatFindingProvenance
}
