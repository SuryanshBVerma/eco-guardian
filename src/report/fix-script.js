'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { PLATFORM } = require('../config/constants');
const { detectProjectOS } = require('../findings/fix');

function generatePowerShellStep(step) {
  if (step.project === '(global)') return step.command;
  return `Set-Location -LiteralPath "${step.project}"; ${step.command}`;
}

function generateBashStep(step) {
  if (step.project === '(global)') return step.command;
  return `cd "${step.project}" && ${step.command}`;
}

async function writeFixScript(findings, options) {
  if (!options.fix || findings.length === 0) return null;

  const steps = new Map();
  for (const finding of findings) {
    const pkg = `${finding.package}@${finding.version}`;
    for (const step of finding.fix_steps || []) {
      if (!step || !step.command) continue;
      const key = `${step.project}|${step.command}`;
      steps.set(key, { project: step.project, command: step.command, pkg });
    }
  }

  const stamp = new Date().toISOString();
  const ps1Lines = [];
  const shLines = [];

  ps1Lines.push('# eco-guardian fix script - generated ' + stamp);
  ps1Lines.push('# Review before running. This will modify your node_modules.');
  ps1Lines.push('');

  shLines.push('#!/bin/bash');
  shLines.push(`# eco-guardian fix script - generated ${stamp}`);
  shLines.push('# Review before running. This will modify your node_modules.');
  shLines.push('');

  for (const step of steps.values()) {
    const targetOS = detectProjectOS(step.project);

    ps1Lines.push(`Write-Host "Fixing ${step.pkg} in ${step.project}..."`);
    ps1Lines.push(generatePowerShellStep(step));
    ps1Lines.push('');

    shLines.push(`echo "Fixing ${step.pkg} in ${step.project}..."`);
    shLines.push(generateBashStep(step));
    shLines.push('');
  }

  const ps1File = path.join(process.cwd(), 'eco-guardian-fixes.ps1');
  const shFile = path.join(process.cwd(), 'eco-guardian-fixes.sh');

  await fsp.writeFile(ps1File, `${ps1Lines.join('\n')}\n`, 'utf8');
  await fsp.writeFile(shFile, `${shLines.join('\n')}\n`, 'utf8');
  await fsp.chmod(shFile, 0o755);

  return ps1File;
}

module.exports = {
  writeFixScript
};
