"use strict";

const { resolveNpmPackages } = require("./npm");
const { resolveMavenPackages } = require("./maven");
const { resolveNuGetPackages } = require("./nuget");
const { resolveGoPackages } = require("./go");
const { resolvePythonPackages } = require("./python");
const { resolveGradlePackages } = require("./gradle");
const { resolveRubyPackages } = require("./ruby");
const { resolveRustPackages } = require("./rust");
const { resolvePhpPackages } = require("./php");
const { resolveDartPackages } = require("./dart");
const { resolveElixirPackages } = require("./elixir");
const { resolveConanPackages } = require("./conan");
const { resolveHaskellPackages } = require("./haskell");
const { resolveSwiftPackages } = require("./swift");
const { resolveRPackages } = require("./r");
const { log } = require("../cli/output");

const { GRAPH_RESOLUTION_SUPPORT } = require("../config/constants");

const RESOLVERS = {
  npm: resolveNpmPackages,
  maven: resolveMavenPackages,
  nuget: resolveNuGetPackages,
  go: resolveGoPackages,
  python: resolvePythonPackages,
  gradle: resolveGradlePackages,
  ruby: resolveRubyPackages,
  rust: resolveRustPackages,
  php: resolvePhpPackages,
  dart: resolveDartPackages,
  elixir: resolveElixirPackages,
  conan: resolveConanPackages,
  haskell: resolveHaskellPackages,
  swift: resolveSwiftPackages,
  r: resolveRPackages,
};

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

  if (options.verbose) {
    log(
      "info",
      `Attempting graph resolution for ${ecosystem} (support: ${support})...`,
      options,
    );
  }

  try {
    const resolver = RESOLVERS[ecosystem];
    const packageMap = resolver
      ? await resolver(roots, options, state)
      : new Map();

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
    if (options.verbose) {
      log(
        "warn",
        `Graph resolution failed for ${ecosystem}: ${error.message}`,
        options,
      );
    }
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
