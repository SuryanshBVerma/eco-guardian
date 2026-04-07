'use strict';

const path = require('path');
const { PLATFORM } = require('../config/constants');

function filterNestedNodeModules(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    if (!p) continue;
    const resolved = path.resolve(p);
    const parts = resolved.replace(/\\+/g, '/').split('/').filter(Boolean).map((s) => s.toLowerCase());
    if (parts[parts.length - 1] !== 'node_modules') continue;
    if (parts.slice(0, -1).includes('node_modules')) continue;
    const key = PLATFORM === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

function dedupePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    if (!p) continue;
    const resolved = path.resolve(p);
    const key = PLATFORM === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

function toRootPathWindows(drive) {
  const d = (drive || '').trim();
  if (!/^[A-Za-z]:$/.test(d)) return null;
  return `${d}\\`;
}

module.exports = {
  filterNestedNodeModules,
  dedupePaths,
  toRootPathWindows
};
