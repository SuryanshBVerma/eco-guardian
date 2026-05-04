'use strict'

function normalizeToken (text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Builds a ranked list of candidate CPE 2.3 strings from Java evidence.
 * Returns [] if any required field is missing.
 */
function buildCandidateCpes (evidence) {
  const vendor = normalizeToken(evidence.groupId)
  const product = normalizeToken(evidence.artifactId)
  const version = normalizeToken(evidence.version)
  if (!vendor || !product || !version) return []
  const candidates = [
    {
      cpeName: `cpe:2.3:a:${vendor}:${product}:${version}:*:*:*:*:*:*:*`,
      confidence: 'high'
    }
  ]
  // Secondary candidate: try just the artifactId as vendor (common Maven pattern)
  if (vendor !== product) {
    candidates.push({
      cpeName: `cpe:2.3:a:${product}:${product}:${version}:*:*:*:*:*:*:*`,
      confidence: 'medium'
    })
  }
  return candidates
}

module.exports = { buildCandidateCpes, normalizeToken }
