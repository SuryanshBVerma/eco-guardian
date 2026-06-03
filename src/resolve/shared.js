'use strict'

const { runCommand } = require('../shared/command')

/**
 * Execute a command using execFile (safer than shell string execution).
 * Resolves with stdout, rejects with Error if command fails.
 */
async function execTool (file, args = [], options = {}) {
  const result = await runCommand(file, args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs || 60000
  })
  if (!result.ok) {
    const err = new Error(
      `Command failed: ${file} ${args.join(' ')}\n${result.stderr}\nstdout: ${result.stdout}`
    )
    err.code = result.error && result.error.code
    err.stderr = result.stderr
    err.stdout = result.stdout
    throw err
  }
  return result.stdout
}

/**
 * Create a normalized package record for the graph-resolved view.
 */
function createGraphPackage (
  ecosystem,
  name,
  version,
  pathArray = [],
  depth = 0
) {
  const { OSV_ECOSYSTEM_MAP } = require('../config/constants')
  return {
    key: `${ecosystem}|${name}|${version}`,
    name,
    version,
    ecosystem,
    osvEcosystem: OSV_ECOSYSTEM_MAP[ecosystem] || ecosystem,
    resolution_mode: 'graph',
    resolved_path: pathArray,
    depth,
    paths: [],
    occurrences: []
  }
}

module.exports = {
  execTool,
  createGraphPackage
}
