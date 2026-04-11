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
      // Try to find a concrete version first (no range symbols)
      for (const version of advisory.fixed_versions) {
        if (!version) continue;
        // If it's a comma-separated list, take the first one
        const parts = version.split(',').map(v => v.trim()).filter(Boolean);
        const candidate = parts.find(v => !/[<>=|]/.test(v));
        if (candidate) return candidate;
      }
    }
  }
  return null;
}

function buildFixCommand({ ecosystem, packageName, fixedVersion, dependencyType, isGlobal, parentPackage }) {
  if (ecosystem !== 'npm') return null;
  if (isGlobal) return fixedVersion ? `npm install -g ${packageName}@${fixedVersion}` : `npm uninstall -g ${packageName}`;
  if (dependencyType === 'direct') return fixedVersion ? `npm install ${packageName}@${fixedVersion}` : `npm uninstall ${packageName}`;
  if (dependencyType === 'transitive') return parentPackage && parentPackage.name ? `npm install ${parentPackage.name}@latest` : null;
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
