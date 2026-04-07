'use strict';

const https = require('https');
const { VERSION, OSV_BATCH_SIZE, API_CONCURRENCY } = require('../config/constants');
const { chunkArray, asyncPool } = require('../shared/async');
const { log } = require('../cli/output');
const { normalizeOsvAdvisory } = require('./normalizers');

function httpsPost(url, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': `npm-guardian/${VERSION}`
      }
    }, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { chunks += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (_) { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`)));
    req.on('error', (error) => reject(new Error(`Network error for ${url}: ${error.message}`)));
    req.write(payload);
    req.end();
  });
}

async function queryOsvForKeys(keys, options) {
  if (keys.length === 0) return {};
  const chunks = chunkArray(keys, OSV_BATCH_SIZE);
  log('info', `Querying OSV database... (${chunks.length} batches, ${keys.length.toLocaleString()} packages)`, options);

  const responses = await asyncPool(API_CONCURRENCY, chunks, async (chunk) => {
    const queries = chunk.map((key) => {
      const split = key.lastIndexOf('@');
      return { package: { name: key.slice(0, split), ecosystem: 'npm' }, version: key.slice(split + 1) };
    });
    return httpsPost('https://api.osv.dev/v1/querybatch', { queries }, 10000);
  });

  const out = {};
  for (let ci = 0; ci < chunks.length; ci += 1) {
    const chunk = chunks[ci];
    const results = responses[ci] && Array.isArray(responses[ci].results) ? responses[ci].results : [];
    for (let i = 0; i < chunk.length; i += 1) {
      const raw = results[i];
      const advisories = raw && Array.isArray(raw.vulns) ? raw.vulns.map(normalizeOsvAdvisory) : [];
      out[chunk[i]] = { vulnerable: advisories.length > 0, advisories };
    }
  }
  return out;
}

async function queryNpmBulk(body, options) {
  if (Object.keys(body).length === 0) return {};
  log('info', 'Cross-checking npm advisories...', options);
  const data = await httpsPost('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', body, 10000);
  return data && typeof data === 'object' ? data : {};
}

module.exports = {
  queryOsvForKeys,
  queryNpmBulk
};
