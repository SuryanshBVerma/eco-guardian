'use strict';

const { resolveNpmPackages } = require('./npm');
const { resolveMavenPackages } = require('./maven');
const { resolveNuGetPackages } = require('./nuget');
const { resolveGoPackages } = require('./go');
const { resolvePythonPackages } = require('./python');
const { log } = require('../cli/output');

/**
 * Main entry point for ecosystem-specific graph resolution.
 * If resolution is requested and supported, it uses the native tool backends.
 */
async function resolveEcosystemPackages(ecosystem, roots, options, state) {
  if (options.verbose) log('info', `Attempting graph resolution for ${ecosystem}...`, options);
  
  switch (ecosystem) {
    case 'npm':
      return resolveNpmPackages(roots, options, state);
    case 'maven':
      return resolveMavenPackages(roots, options, state);
    case 'nuget':
      return resolveNuGetPackages(roots, options, state);
    case 'go':
      return resolveGoPackages(roots, options, state);
    case 'python':
      return resolvePythonPackages(roots, options, state);
    default:
      return new Map();
  }
}

module.exports = {
  resolveEcosystemPackages
};
