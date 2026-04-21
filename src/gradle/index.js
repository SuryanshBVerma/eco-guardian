"use strict";

const { discoverGradleProjects } = require("./discover");
const { parseGradleBuild } = require("./parse-build");
const { parseGradleLockfile } = require("./parse-lockfile");
const { parseGradleSettings } = require("./parse-settings");
const { parseVersionCatalog } = require("./parse-version-catalog");
const { resolveGradleStatic } = require("./resolve-static");
const {
  fetchMetadata,
  parsePomDependencies,
  parseModuleDependencies,
} = require("./fetch-metadata");

module.exports = {
  discoverGradleProjects,
  parseGradleBuild,
  parseGradleLockfile,
  parseGradleSettings,
  parseVersionCatalog,
  resolveGradleStatic,
  fetchMetadata,
  parsePomDependencies,
  parseModuleDependencies,
};
