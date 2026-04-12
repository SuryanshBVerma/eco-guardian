'use strict';

const { exec } = require('child_process');

/**
 * Execute a shell command and return output as a string.
 * Resolves with stdout, rejects with Error if command fails.
 */
function execAsync(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        const err = new Error(`Command failed: ${command}\n${stderr}\nstdout: ${stdout}`);
        err.code = error.code;
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

/**
 * Create a normalized package record for the graph-resolved view.
 */
function createGraphPackage(ecosystem, name, version, pathArray = [], depth = 0) {
  const { OSV_ECOSYSTEM_MAP } = require('../config/constants');
  return {
    key: `${ecosystem}|${name}|${version}`,
    name,
    version,
    ecosystem,
    osvEcosystem: OSV_ECOSYSTEM_MAP[ecosystem] || ecosystem,
    resolution_mode: 'graph',
    resolved_path: pathArray,
    depth,
    paths: [], // Locations for reporting
    occurrences: [] // For legacy compatibility
  };
}

module.exports = {
  execAsync,
  createGraphPackage
};
