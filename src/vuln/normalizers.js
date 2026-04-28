'use strict'

const { SEVERITY_ORDER } = require('../config/constants')

function normalizeSeverity (input) {
  if (!input) return 'MODERATE'
  const lower = String(input).toLowerCase()
  if (lower.includes('critical')) return 'CRITICAL'
  if (lower.includes('high')) return 'HIGH'
  if (lower.includes('moderate') || lower.includes('medium')) return 'MODERATE'
  if (lower.includes('low')) return 'LOW'
  return 'MODERATE'
}

function severityAllowed (severity, threshold) {
  const sev = String(severity || 'LOW').toLowerCase()
  const limit = String(threshold || 'low').toLowerCase()
  return (SEVERITY_ORDER[sev] || 1) >= (SEVERITY_ORDER[limit] || 1)
}

function findOsvCvss (raw) {
  if (!raw || !Array.isArray(raw.severity)) return null
  for (const s of raw.severity) {
    if (!s || typeof s.score !== 'string') continue
    const match = s.score.match(/([0-9]+\.?[0-9]*)$/)
    if (match) return Number(match[1])
  }
  return null
}

function eventsToRange (affected) {
  if (!Array.isArray(affected)) return null
  const parts = []
  for (const item of affected) {
    if (!item || !Array.isArray(item.ranges)) continue
    for (const range of item.ranges) {
      if (!range || !Array.isArray(range.events)) continue
      const clauses = []
      for (const ev of range.events) {
        if (ev.introduced) clauses.push(`>=${ev.introduced}`)
        if (ev.fixed) clauses.push(`<${ev.fixed}`)
      }
      if (clauses.length > 0) parts.push(clauses.join(', '))
    }
  }
  return parts.length > 0 ? parts.join(' OR ') : null
}

function extractOsvFixed (affected) {
  if (!Array.isArray(affected)) return []
  const out = new Set()
  for (const item of affected) {
    if (!item || !Array.isArray(item.ranges)) continue
    for (const range of item.ranges) {
      if (!range || !Array.isArray(range.events)) continue
      for (const ev of range.events) if (ev.fixed) out.add(String(ev.fixed))
    }
  }
  return Array.from(out)
}

function normalizeOsvAdvisory (raw) {
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.slice() : []
  const cve =
    aliases.find(
      (a) => typeof a === 'string' && a.toUpperCase().startsWith('CVE-')
    ) || null
  return {
    id: raw.id || cve || 'OSV-UNKNOWN',
    aliases,
    severity: normalizeSeverity(
      raw.database_specific && raw.database_specific.severity
        ? raw.database_specific.severity
        : raw.severity && raw.severity[0] && raw.severity[0].type
    ),
    cvss_score: findOsvCvss(raw),
    title: raw.summary || raw.id || 'Vulnerability advisory',
    description: raw.details || raw.summary || '',
    affected_versions: eventsToRange(raw.affected),
    fixed_versions: extractOsvFixed(raw.affected),
    references: Array.isArray(raw.references)
      ? raw.references.map((r) => (r && r.url) || null).filter(Boolean)
      : [],
    source: 'osv',
    cve
  }
}

function normalizeNpmAdvisory (raw) {
  const aliases = Array.isArray(raw.cves) ? raw.cves.slice() : []
  const cve =
    aliases.find(
      (a) => typeof a === 'string' && a.toUpperCase().startsWith('CVE-')
    ) || null
  return {
    id: raw.ghsaId || raw.id || cve || 'NPM-UNKNOWN',
    aliases,
    severity: normalizeSeverity(raw.severity),
    cvss_score: typeof raw.cvssScore === 'number' ? raw.cvssScore : null,
    title: raw.title || raw.ghsaId || 'npm advisory',
    description: raw.overview || raw.title || '',
    affected_versions: raw.vulnerable_versions || null,
    fixed_versions: raw.patched_versions ? [raw.patched_versions] : [],
    references: raw.url ? [raw.url] : [],
    source: 'npm',
    cve
  }
}

function dedupeAdvisories (advisories) {
  const seen = new Set()
  const out = []
  for (const item of advisories) {
    const key = `${item.id}|${item.source}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function advisoryPasses (advisory, threshold) {
  return severityAllowed(
    String(advisory.severity || 'LOW').toLowerCase(),
    threshold
  )
}

function cvssToSeverity (score) {
  if (score == null) return 'MODERATE'
  if (score >= 9.0) return 'CRITICAL'
  if (score >= 7.0) return 'HIGH'
  if (score >= 4.0) return 'MODERATE'
  return 'LOW'
}

function extractNvdCvss (metrics) {
  if (!metrics) return null
  return (
    metrics.cvssMetricV31?.[0]?.cvssData?.baseScore ??
    metrics.cvssMetricV30?.[0]?.cvssData?.baseScore ??
    metrics.cvssMetricV2?.[0]?.cvssData?.baseScore ??
    null
  )
}

/**
 * Normalizes an NVD CVE object (from /rest/json/cves/2.0 vulnerabilities[].cve)
 * into the same advisory shape used throughout eco-guardian.
 */
function normalizeNvdCve (cveRecord, candidate) {
  const cveId = cveRecord?.id || null
  const metrics = cveRecord?.metrics || {}
  const cvss = extractNvdCvss(metrics)
  const description =
    (cveRecord?.descriptions || []).find((d) => d.lang === 'en')?.value ||
    cveId ||
    'NVD finding'
  return {
    id: cveId || `NVD-${Date.now()}`,
    aliases: cveId ? [cveId] : [],
    severity: cvssToSeverity(cvss),
    cvss_score: cvss,
    title: description.slice(0, 200),
    description,
    affected_versions: null,
    fixed_versions: [],
    references: (cveRecord?.references || []).map((r) => r.url).filter(Boolean),
    source: 'nvd',
    cve: cveId,
    match_confidence: candidate?.confidence || 'unknown'
  }
}

/**
 * Cross-source dedupe: if the same CVE-ID appears in both OSV and NVD results,
 * prefer the OSV entry (it has richer fixed_versions data) and drop the NVD duplicate.
 */
function dedupeAcrossSources (advisories) {
  const osvCves = new Set(
    advisories.filter((a) => a.source !== 'nvd' && a.cve).map((a) => a.cve)
  )
  return advisories.filter((a) => {
    if (a.source === 'nvd' && a.cve && osvCves.has(a.cve)) return false
    return true
  })
}

module.exports = {
  normalizeSeverity,
  severityAllowed,
  findOsvCvss,
  eventsToRange,
  extractOsvFixed,
  normalizeOsvAdvisory,
  normalizeNpmAdvisory,
  normalizeNvdCve,
  dedupeAdvisories,
  dedupeAcrossSources,
  advisoryPasses,
  cvssToSeverity,
  extractNvdCvss
}
