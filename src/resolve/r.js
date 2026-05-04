'use strict'

// R: no universal CLI tree tool. Graph resolution returns empty
// so the caller falls back to inventory (parseRenvLock).
async function resolveRPackages (roots, options, state) {
  return new Map()
}

module.exports = { resolveRPackages }
