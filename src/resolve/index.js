"use strict";

const { resolveNpmPackages } = require("./npm");
const { resolveMavenPackages } = require("./maven");
const { resolveNuGetPackages } = require("./nuget");
const { resolveGoPackages } = require("./go");
const { resolvePythonPackages } = require("./python");
const { log } = require("../cli/output");

const { GRAPH_RESOLUTION_SUPPORT } = require("../config/constants");

/**
 * Main entry point for ecosystem-specific graph resolution.
 * If resolution is requested and supported, it uses the native tool backends.
 * Returns { packageMap, mode, usedFallback, error }
 */
async function resolveEcosystemPackages(ecosystem, roots, options, state) {
  const support = GRAPH_RESOLUTION_SUPPORT[ecosystem] || "not_applicable";

  if (support === "not_applicable") {
    return {
      ecosystem,
      support,
      mode: "n/a",
      packageMap: new Map(),
      usedFallback: false,
    };
  }

  if (options.verbose)
    log(
      "info",
      `Attempting graph resolution for ${ecosystem} (support: ${support})...`,
      options,
    );

  try {
    let packageMap;
    switch (ecosystem) {
      case "npm":
        packageMap = await resolveNpmPackages(roots, options, state);
        break;
      case "maven":
        packageMap = await resolveMavenPackages(roots, options, state);
        break;
      case "nuget":
        packageMap = await resolveNuGetPackages(roots, options, state);
        break;
      case "go":
        packageMap = await resolveGoPackages(roots, options, state);
        break;
      case "python":
        packageMap = await resolvePythonPackages(roots, options, state);
        break;
      default:
        packageMap = new Map();
        break;
    }

    const usedFallback = !packageMap || packageMap.size === 0;
    const mode = usedFallback
      ? "inventory-fallback"
      : support === "partial"
        ? "graph-partial"
        : "graph";

    return {
      ecosystem,
      support,
      mode,
      packageMap: packageMap || new Map(),
      usedFallback,
    };
  } catch (error) {
    if (options.verbose)
      log(
        "warn",
        `Graph resolution failed for ${ecosystem}: ${error.message}`,
        options,
      );
    return {
      ecosystem,
      support,
      mode: "inventory-fallback",
      packageMap: new Map(),
      usedFallback: true,
      reason: error.message,
    };
  }
}

module.exports = {
  resolveEcosystemPackages,
};
