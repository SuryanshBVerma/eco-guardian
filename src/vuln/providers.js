'use strict'

const https = require('https')
const {
  VERSION,
  OSV_BATCH_SIZE,
  API_CONCURRENCY
} = require('../config/constants')
const { chunkArray, asyncPool } = require('../shared/async')
const { log } = require('../cli/output')
const { normalizeOsvAdvisory } = require('./normalizers')

function httpsPost (url, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': `eco-guardian/${VERSION}`
        }
      },
      (res) => {
        let chunks = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          chunks += chunk
        })
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) { return reject(new Error(`HTTP ${res.statusCode} from ${url}`)) }
          try {
            resolve(chunks ? JSON.parse(chunks) : {})
          } catch (_) {
            reject(new Error(`Invalid JSON from ${url}`))
          }
        })
      }
    )
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`))
    )
    req.on('error', (error) =>
      reject(new Error(`Network error for ${url}: ${error.message}`))
    )
    req.write(payload)
    req.end()
  })
}

function httpsGet (url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': `eco-guardian/${VERSION}`
        }
      },
      (res) => {
        let chunks = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          chunks += chunk
        })
        res.on('end', () => {
          if (res.statusCode >= 400) { return reject(new Error(`HTTP ${res.statusCode} from ${url}`)) }
          try {
            resolve(chunks ? JSON.parse(chunks) : {})
          } catch (_) {
            reject(new Error(`Invalid JSON from ${url}`))
          }
        })
      }
    )
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`))
    )
    req.on('error', (error) =>
      reject(new Error(`Network error for ${url}: ${error.message}`))
    )
  })
}

async function queryOsvForPackages (packages, options) {
  if (packages.length === 0) return {}
  const chunks = chunkArray(packages, OSV_BATCH_SIZE)
  log(
    'info',
    `Querying OSV database... (${chunks.length} batches, ${packages.length.toLocaleString()} packages)`,
    options
  )

  const responses = await asyncPool(API_CONCURRENCY, chunks, async (chunk) => {
    const queries = chunk.map((pkg) => ({
      package: { name: pkg.name, ecosystem: pkg.osvEcosystem || pkg.ecosystem },
      version: pkg.version
    }))
    return httpsPost('https://api.osv.dev/v1/querybatch', { queries }, 10000)
  })

  const uniqueVids = new Set()
  for (let ci = 0; ci < chunks.length; ci += 1) {
    const results =
      responses[ci] && Array.isArray(responses[ci].results)
        ? responses[ci].results
        : []
    for (const raw of results) {
      if (raw && Array.isArray(raw.vulns)) {
        for (const v of raw.vulns) {
          if (v && v.id) uniqueVids.add(v.id)
        }
      }
    }
  }

  const fullRecords = new Map()
  if (uniqueVids.size > 0) {
    await asyncPool(API_CONCURRENCY, Array.from(uniqueVids), async (vid) => {
      try {
        const details = await httpsGet(`https://api.osv.dev/v1/vulns/${vid}`)
        fullRecords.set(vid, details)
      } catch (err) {
        log(
          'error',
          `Failed to fetch full details for ${vid}: ${err.message}`,
          options
        )
      }
    })
  }

  const out = {}
  for (let ci = 0; ci < chunks.length; ci += 1) {
    const chunk = chunks[ci]
    const results =
      responses[ci] && Array.isArray(responses[ci].results)
        ? responses[ci].results
        : []
    for (let i = 0; i < chunk.length; i += 1) {
      const raw = results[i]
      const hydratedVulns = []
      if (raw && Array.isArray(raw.vulns)) {
        for (const v of raw.vulns) {
          const full = fullRecords.get(v.id)
          hydratedVulns.push(full || v)
        }
      }
      const advisories = hydratedVulns.map(normalizeOsvAdvisory)
      out[chunk[i].key] = { vulnerable: advisories.length > 0, advisories }
    }
  }
  return out
}

async function queryNpmBulk (body, options) {
  if (Object.keys(body).length === 0) return {}
  log('info', 'Cross-checking npm advisories...', options)
  const data = await httpsPost(
    'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    body,
    10000
  )
  return data && typeof data === 'object' ? data : {}
}

module.exports = {
  queryOsvForPackages,
  queryNpmBulk
}
