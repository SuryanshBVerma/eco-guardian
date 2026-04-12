'use strict';

const fs = require('fs');
const path = require('path');
const { PLATFORM } = require('../config/constants');

function detectProjectOS(projectPath) {
  if (!projectPath || projectPath === '(unknown project)' || projectPath === '(global)') return PLATFORM;
  try {
    const entries = fs.readdirSync(projectPath);
    const lowerEntries = entries.map(e => e.toLowerCase());
    if (lowerEntries.some(e => e.endsWith('.bat') || e.endsWith('.cmd') || e.endsWith('.ps1'))) return 'win32';
    if (lowerEntries.some(e => e.endsWith('.sh'))) return 'linux';
  } catch (_) {}
  return PLATFORM;
}

function pickBestFixedVersion(advisories) {
  for (const advisory of advisories) {
    if (Array.isArray(advisory.fixed_versions) && advisory.fixed_versions.length > 0) {
      for (const version of advisory.fixed_versions) {
        if (!version) continue;
        // Strip ranges like '>=', '<' and take the first part if it's a list
        const cleaned = version.replace(/^[<>=|\s]+/, '').split(',')[0].trim();
        // If it still looks like a range (contains symbols), skip it
        if (cleaned && !/[<>=|]/.test(cleaned)) return cleaned;
      }
    }
  }
  return null;
}

function buildFixCommand({ ecosystem, packageName, fixedVersion, dependencyType, isGlobal, parentPackage }) {
  const eco = String(ecosystem || '').toLowerCase();
  
  if (eco === 'npm') {
    if (isGlobal) return fixedVersion ? `npm install -g ${packageName}@${fixedVersion}` : `npm uninstall -g ${packageName}`;
    if (dependencyType === 'direct') return fixedVersion ? `npm install ${packageName}@${fixedVersion}` : `npm uninstall ${packageName}`;
    if (dependencyType === 'transitive') return parentPackage && parentPackage.name ? `npm install ${parentPackage.name}@latest` : null;
  }

  if (eco === 'maven' || eco === 'pypi' || eco === 'python') {
    if (!fixedVersion) return null;
    if (eco === 'maven') return `mvn versions:use-latest-releases -Dincludes=${packageName.includes(':') ? packageName : '*:' + packageName}`;
    return `pip install --upgrade ${packageName}==${fixedVersion}`;
  }

  if (eco === 'nuget') {
    return fixedVersion ? `dotnet add package ${packageName} --version ${fixedVersion}` : null;
  }

  if (eco === 'go') {
    return fixedVersion ? `go get ${packageName}@v${fixedVersion.replace(/^v/, '')}` : null;
  }

  return null;
}

function buildScopedProjectCommand(project, command) {
  if (!project || project === '(unknown project)') return null;
  const targetOS = detectProjectOS(project);
  if (targetOS === 'win32') return `Set-Location -LiteralPath "${project}"; ${command}`;
  return `cd "${project}" && ${command}`;
}

function buildFixSteps({ ecosystem, foundIn, packageName, fixedVersion }) {
  const steps = [];
  const seen = new Set();

  for (const entry of foundIn || []) {
    const dependencyType = entry && entry.dependency_type ? entry.dependency_type : 'transitive';
    const isGlobal = dependencyType === 'global';
    const command = buildFixCommand({
      ecosystem,
      packageName,
      fixedVersion,
      dependencyType,
      isGlobal,
      parentPackage: entry ? entry.parent : null
    });
    if (!command) continue;

    const project = isGlobal ? '(global)' : (entry && entry.project ? entry.project : '(unknown project)');
    const dedupeKey = `${project}|${command}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    steps.push({ project, command });
  }

  return steps;
}

function fixStepsToDisplayCommands(steps) {
  const out = [];
  for (const step of steps || []) {
    if (step.project === '(global)') {
      out.push(step.command);
      continue;
    }
    const scoped = buildScopedProjectCommand(step.project, step.command);
    if (scoped) out.push(scoped);
  }
  return out;
}

module.exports = {
  detectProjectOS,
  pickBestFixedVersion,
  buildFixCommand,
  buildFixSteps,
  fixStepsToDisplayCommands
};
