"use strict";

const { resolveGradleStatic } = require("../gradle/resolve-static");

async function resolveGradlePackages(roots, options, state) {
  const result = await resolveGradleStatic(roots, options, state);
  return result.packageMap;
}

module.exports = { resolveGradlePackages };
