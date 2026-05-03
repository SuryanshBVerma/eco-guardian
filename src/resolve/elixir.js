"use strict";

// Elixir: no universal CLI tree tool. Graph resolution returns empty
// so the caller falls back to inventory (parseMixLock).
async function resolveElixirPackages(roots, options, state) {
  return new Map();
}

module.exports = { resolveElixirPackages };
