#!/usr/bin/env node
"use strict";

const { VERSION, PLATFORM } = require("./src/config/constants");
const { parseArgs } = require("./src/cli/args");
const { asyncPool, chunkArray } = require("./src/shared/async");
const { filterNestedNodeModules } = require("./src/shared/path-utils");
const { readPackageJson } = require("./src/scan/harvest");
const { normalizeOsvAdvisory } = require("./src/vuln/normalizers");
const { buildFixCommand } = require("./src/findings/fix");
const { runScan } = require("./src/app/run-scan");
const { main } = require("./src/app/main");
const {
  UI_MANIFEST,
  buildCommand,
  getVisibleFields,
  normalizeState,
  shellQuote,
  validateState,
} = require("./src/ui/command-builder");
const { startUiServer } = require("./src/ui/server");
const { parsePomDependencies } = require("./src/scan/maven");
const {
  parseGradleLockfile,
  parseGradleBuildDependencies,
} = require("./src/scan/gradle");
const { buildJavaEvidence } = require("./src/java/evidence");
const { buildCandidateCpes, normalizeToken } = require("./src/java/cpe");
const {
  normalizeNvdCve,
  dedupeAcrossSources,
} = require("./src/vuln/normalizers");
const {
  queryNvdByCpe,
  makeNvdThrottle,
  isTransientError,
  _buildCpeProductCandidates,
  _cveMentionsVersion,
} = require("./src/vuln/providers");
const {
  parsePackagesConfig,
  parseProjectPackageReferences,
  parseDirectoryPackagesProps,
  parsePackagesLockJson,
} = require("./src/scan/nuget");
const { parseEcosystemList } = require("./src/cli/args");
const { collectVSCodeExtensions } = require("./src/scan/vscode");
const {
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
} = require("./src/scan/python");
const { parseGoMod } = require("./src/scan/go");
const { parseGemfileLock } = require("./src/scan/ruby");
const { parseCargoLock } = require("./src/scan/rust");
const { parseComposerLock } = require("./src/scan/php");
const { parsePubspecLock } = require("./src/scan/dart");
const { parseMixLock } = require("./src/scan/elixir");
const { parseConanLock } = require("./src/scan/conan");
const { parseStackLock, parseCabalFreeze } = require("./src/scan/haskell");
const { parsePackageResolved } = require("./src/scan/swift");
const { parseRenvLock } = require("./src/scan/r");

if (require.main === module) main();

module.exports = {
  VERSION,
  PLATFORM,
  parseArgs,
  asyncPool,
  chunkArray,
  filterNestedNodeModules,
  readPackageJson,
  normalizeOsvAdvisory,
  buildFixCommand,
  runScan,
  main,
  parsePomDependencies,
  parseGradleLockfile,
  parseGradleBuildDependencies,
  parsePackagesConfig,
  parseProjectPackageReferences,
  parseDirectoryPackagesProps,
  parsePackagesLockJson,
  parseEcosystemList,
  UI_MANIFEST,
  buildCommand,
  getVisibleFields,
  normalizeState,
  shellQuote,
  validateState,
  startUiServer,
  collectVSCodeExtensions,
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
  parseGoMod,
  parseGemfileLock,
  parseCargoLock,
  parseComposerLock,
  parsePubspecLock,
  parseMixLock,
  parseConanLock,
  parseStackLock,
  parseCabalFreeze,
  parsePackageResolved,
  parseRenvLock,
  buildJavaEvidence,
  buildCandidateCpes,
  normalizeToken,
  normalizeNvdCve,
  dedupeAcrossSources,
  queryNvdByCpe,
  makeNvdThrottle,
  isTransientError,
  _buildCpeProductCandidates,
  _cveMentionsVersion,
};
