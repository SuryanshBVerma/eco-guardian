'use strict';

const fsp = require('fs/promises');
const path = require('path');
const {
  PACKAGE_READ_CONCURRENCY,
  PYTHON_MANIFEST_NAMES
} = require('../config/constants');
const { asyncPool } = require('../shared/async');
const { log } = require('../cli/output');
const { discoverManifestFiles } = require('./discovery');

function parseRequirementsTxt(content, filePath) {
  const records = [];
  const lines = content.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.split('#')[0].trim();
    if (!trimmed) continue;
    
    // Support name==version
    const match = trimmed.match(/^([^#\s><=!]+)==([^#\s]+)/);
    if (match) {
      records.push(createPythonRecord(match[1], match[2], filePath, 'requirements.txt'));
    }
  }
  return records;
}

function parsePipfileLock(content, filePath) {
  const records = [];
  try {
    const data = JSON.parse(content);
    const sections = ['default', 'develop'];
    
    for (const section of sections) {
      const deps = data[section] || {};
      for (const name of Object.keys(deps)) {
        const info = deps[name];
        if (info && info.version) {
          // Version is usually "==1.2.3"
          let version = info.version;
          if (version.startsWith('==')) version = version.slice(2);
          records.push(createPythonRecord(name, version, filePath, 'Pipfile.lock'));
        }
      }
    }
  } catch (_) {}
  return records;
}

function parsePoetryLock(content, filePath) {
  const records = [];
  // Split by [[package]] blocks
  const blocks = content.split(/\[\[package\]\]/);
  
  for (const block of blocks) {
    if (!block.trim()) continue;
    
    const nameMatch = block.match(/name\s*=\s*"([^"]+)"/);
    const versionMatch = block.match(/version\s*=\s*"([^"]+)"/);
    
    if (nameMatch && versionMatch) {
      records.push(createPythonRecord(nameMatch[1], versionMatch[1], filePath, 'poetry.lock'));
    }
  }
  return records;
}

function createPythonRecord(name, version, filePath, rawSource) {
  return {
    key: `PyPI|${name}|${version}`,
    ecosystem: 'python',
    name,
    version,
    osvEcosystem: 'PyPI',
    paths: [],
    occurrences: [
      {
        project: path.dirname(filePath),
        manifest_path: filePath,
        dependency_type: 'direct', // Simplification for requirements/lock
        raw_source: rawSource
      }
    ]
  };
}

async function collectPythonPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };
  
  const manifestDirs = await discoverManifestFiles(roots, PYTHON_MANIFEST_NAMES, options, counters, 'Python manifests');
  
  let totalEntries = 0;
  
  await asyncPool(PACKAGE_READ_CONCURRENCY, manifestDirs, async (dir) => {
    let files;
    try { files = await fsp.readdir(dir); } catch (_) { return; }
    
    const records = [];
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (file === 'requirements.txt') {
        let raw; try { raw = await fsp.readFile(filePath, 'utf8'); } catch (_) { continue; }
        records.push(...parseRequirementsTxt(raw, filePath));
      } else if (file === 'Pipfile.lock') {
        let raw; try { raw = await fsp.readFile(filePath, 'utf8'); } catch (_) { continue; }
        records.push(...parsePipfileLock(raw, filePath));
      } else if (file === 'poetry.lock') {
        let raw; try { raw = await fsp.readFile(filePath, 'utf8'); } catch (_) { continue; }
        records.push(...parsePoetryLock(raw, filePath));
      }
    }
    
    totalEntries += records.length;
    for (const record of records) {
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

  log('info', `Harvested ${totalEntries.toLocaleString()} Python dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`, options);
  return packageMap;
}

module.exports = {
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
  collectPythonPackages
};
