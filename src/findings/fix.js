'use strict';

const { PLATFORM } = require('../config/constants');

function pickBestFixedVersion(advisories) {
  for (const advisory of advisories) {
    if (Array.isArray(advisory.fixed_versions) && advisory.fixed_versions.length > 0) {
      const candidate = advisory.fixed_versions[0];
      if (candidate && !candidate.includes('||') && !candidate.includes('<') && !candidate.includes('>')) return candidate;
    }
  }
  return null;
}

function buildFixCommand({ packageName, fixedVersion, dependencyType, isGlobal, parentPackage }) {
  if (isGlobal) return fixedVersion ? `npm install -g ${packageName}@${fixedVersion}` : `npm uninstall -g ${packageName}`;
  if (dependencyType === 'direct') return fixedVersion ? `npm install ${packageName}@${fixedVersion}` : `npm uninstall ${packageName}`;
  if (dependencyType === 'transitive') return parentPackage && parentPackage.name ? `npm install ${parentPackage.name}@latest` : null;
  return null;
}

function buildScopedProjectCommand(project, command) {
  if (!project || project === '(unknown project)') return null;
  return PLATFORM === 'win32' ? `cd /d "${project}" && ${command}` : `cd "${project}" && ${command}`;
}

function buildFixSteps(foundIn, packageName, fixedVersion) {
  const steps = [];
  const seen = new Set();

  for (const entry of foundIn || []) {
    const dependencyType = entry && entry.dependency_type ? entry.dependency_type : 'transitive';
    const isGlobal = dependencyType === 'global';
    const command = buildFixCommand({
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
  pickBestFixedVersion,
  buildFixCommand,
  buildFixSteps,
  fixStepsToDisplayCommands
};
