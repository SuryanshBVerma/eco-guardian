'use strict'

const { discoverGradleProjects } = require('./discover')
const { parseGradleBuild } = require('./parse-build')
const { parseGradleLockfile } = require('./parse-lockfile')
const { parseGradleSettings } = require('./parse-settings')
const { parseVersionCatalog } = require('./parse-version-catalog')
const {
  parseGradleDependenciesOutput
} = require('./parse-dependencies-output')
const { resolveGradleTaskPackages } = require('./task-resolution')
const { resolveGradleStatic } = require('./resolve-static')
const {
  fetchMetadata,
  parsePomDependencies,
  parseModuleDependencies
} = require('./fetch-metadata')

module.exports = {
  discoverGradleProjects,
  parseGradleBuild,
  parseGradleLockfile,
  parseGradleSettings,
  parseVersionCatalog,
  parseGradleDependenciesOutput,
  resolveGradleStatic,
  resolveGradleTaskPackages,
  fetchMetadata,
  parsePomDependencies,
  parseModuleDependencies
}
