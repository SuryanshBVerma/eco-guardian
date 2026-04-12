#!/usr/bin/env node
'use strict'

const { VERSION, PLATFORM } = require('./src/config/constants')
const { parseArgs } = require('./src/cli/args')
const { asyncPool, chunkArray } = require('./src/shared/async')
const { filterNestedNodeModules } = require('./src/shared/path-utils')
const { readPackageJson } = require('./src/scan/harvest')
const { normalizeOsvAdvisory } = require('./src/vuln/normalizers')
const { buildFixCommand } = require('./src/findings/fix')
const { runScan } = require('./src/app/run-scan')
const { main } = require('./src/app/main')
const { parsePomDependencies } = require('./src/scan/maven')
const {
  parsePackagesConfig,
  parseProjectPackageReferences,
  parseDirectoryPackagesProps,
  parsePackagesLockJson
} = require('./src/scan/nuget')
const { parseEcosystemList } = require('./src/cli/args')
const { collectVSCodeExtensions } = require('./src/scan/vscode')
const {
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock
} = require('./src/scan/python')
const { parseGoMod } = require('./src/scan/go')

if (require.main === module) main()

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
  parsePackagesConfig,
  parseProjectPackageReferences,
  parseDirectoryPackagesProps,
  parsePackagesLockJson,
  parseEcosystemList,
  collectVSCodeExtensions,
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
  parseGoMod
}
