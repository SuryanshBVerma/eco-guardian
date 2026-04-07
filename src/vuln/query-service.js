'use strict';

const { CACHE_TTL_MS } = require('../config/constants');
const { nowMs, hrSeconds } = require('../shared/async');
const { log } = require('../cli/output');
const { loadCache, saveCache } = require('./cache');
const { queryOsvForKeys, queryNpmBulk } = require('./providers');
const { normalizeNpmAdvisory, dedupeAdvisories, advisoryPasses } = require('./normalizers');

async function queryVulnerabilities(packageMap, options) {
  const started = nowMs();
  const keys = Array.from(packageMap.keys());
  const cache = await loadCache(options);
  const results = {};

  const cachedKeys = [];
  const uncachedKeys = [];
  for (const key of keys) {
    if (cache.results[key]) cachedKeys.push(key);
    else uncachedKeys.push(key);
  }

  for (const key of cachedKeys) {
    const cached = cache.results[key];
    const advisories = Array.isArray(cached.advisories) ? cached.advisories.filter((a) => advisoryPasses(a, options.severity)) : [];
    results[key] = { vulnerable: advisories.length > 0, advisories };
  }

  let osvResults = {};
  let osvFailed = false;
  if (uncachedKeys.length > 0) {
    try { osvResults = await queryOsvForKeys(uncachedKeys, options); }
    catch (error) { osvFailed = true; log('warn', `OSV unavailable: ${error.message}`, options); }
  }

  const npmTarget = osvFailed ? uncachedKeys : Object.keys(osvResults).filter((k) => osvResults[k] && osvResults[k].vulnerable);
  let npmCross = {};
  if (npmTarget.length > 0) {
    const byName = {};
    for (const key of npmTarget) {
      const split = key.lastIndexOf('@');
      const name = key.slice(0, split);
      const version = key.slice(split + 1);
      if (!byName[name]) byName[name] = [];
      byName[name].push(version);
    }
    try { npmCross = await queryNpmBulk(byName, options); }
    catch (error) { log('warn', `npm advisory cross-check unavailable: ${error.message}`, options); }
  }

  if (osvFailed && Object.keys(npmCross).length === 0 && uncachedKeys.length > 0) {
    throw new Error('No vulnerability scan possible. OSV and npm advisory endpoints are unreachable.');
  }

  for (const key of uncachedKeys) {
    const split = key.lastIndexOf('@');
    const pkgName = key.slice(0, split);
    const pkgVersion = key.slice(split + 1);

    const advisories = [];
    if (osvResults[key] && Array.isArray(osvResults[key].advisories)) advisories.push(...osvResults[key].advisories);

    const npmItems = npmCross[pkgName];
    if (Array.isArray(npmItems)) {
      for (const raw of npmItems) {
        const vulnerableVersions = raw.vulnerable_versions ? String(raw.vulnerable_versions) : '';
        if (!vulnerableVersions || vulnerableVersions.includes(pkgVersion)) advisories.push(normalizeNpmAdvisory(raw));
      }
    }

    const filtered = dedupeAdvisories(advisories).filter((a) => advisoryPasses(a, options.severity));
    const record = { vulnerable: filtered.length > 0, advisories: filtered };
    results[key] = record;
    cache.results[key] = record;
  }

  cache.generated = Date.now();
  cache.ttl_ms = CACHE_TTL_MS;
  await saveCache(cache, options);
  log('success', `Vulnerability query complete in ${hrSeconds(started)}s`, options);
  return results;
}

module.exports = {
  queryVulnerabilities
};
