'use strict';

const fsp = require('fs/promises');
const path = require('path');
const {
  PACKAGE_READ_CONCURRENCY,
  GO_MANIFEST_NAMES
} = require('../config/constants');
const { asyncPool } = require('../shared/async');
const { log } = require('../cli/output');
const { discoverManifestFiles } = require('./discovery');

function parseGoMod(content, filePath) {
  const records = [];
  const lines = content.split(/\r?\n/);
  
  let inRequireBlock = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('require (')) {
      inRequireBlock = true;
      continue;
    }
    
    if (inRequireBlock && trimmed === ')') {
      inRequireBlock = false;
      continue;
    }

    if (inRequireBlock) {
      // Format: module version [// indirect]
      const match = trimmed.match(/^([^\s]+)\s+(v[^\s]+)/);
      if (match) {
        records.push(createGoRecord(match[1], match[2], filePath, trimmed.includes('// indirect') ? 'transitive' : 'direct'));
      }
    } else if (trimmed.startsWith('require ')) {
      // Format: require module version [// indirect]
      const match = trimmed.match(/^require\s+([^\s]+)\s+(v[^\s]+)/);
      if (match) {
        records.push(createGoRecord(match[1], match[2], filePath, trimmed.includes('// indirect') ? 'transitive' : 'direct'));
      }
    }
  }
  
  return records;
}

function createGoRecord(name, version, filePath, type = 'direct') {
  return {
    key: `Go|${name}|${version}`,
    ecosystem: 'Go',
    name,
    version,
    osvEcosystem: 'Go',
    paths: [],
    occurrences: [
      {
        project: path.dirname(filePath),
        manifest_path: filePath,
        dependency_type: type,
        raw_source: 'go.mod'
      }
    ]
  };
}

async function collectGoPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };
  
  const manifestDirs = await discoverManifestFiles(roots, GO_MANIFEST_NAMES, options, counters, 'Go manifests');
  
  let totalEntries = 0;
  
  await asyncPool(PACKAGE_READ_CONCURRENCY, manifestDirs, async (dir) => {
    const filePath = path.join(dir, 'go.mod');
    let raw;
    try { raw = await fsp.readFile(filePath, 'utf8'); } catch (_) { return; }
    
    const deps = parseGoMod(raw, filePath);
    totalEntries += deps.length;
    
    for (const record of deps) {
      const existing = packageMap.get(record.key);
      if (!existing) {
        record.paths = [dir];
        packageMap.set(record.key, record);
      } else {
        existing.occurrences.push(...record.occurrences);
        existing.paths.push(dir);
      }
    }
  });

  log('info', `Harvested ${totalEntries.toLocaleString()} Go dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`, options);
  return packageMap;
}

module.exports = {
  parseGoMod,
  collectGoPackages
};
