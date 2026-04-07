'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { PLATFORM } = require('../config/constants');

async function writeFixScript(findings, options) {
  if (!options.fix || findings.length === 0) return null;

  const isWin = PLATFORM === 'win32';
  const file = isWin ? path.join(process.cwd(), 'npm-guardian-fixes.bat') : path.join(process.cwd(), 'npm-guardian-fixes.sh');

  const steps = new Map();
  for (const finding of findings) {
    const pkg = `${finding.package}@${finding.version}`;
    for (const step of finding.fix_steps || []) {
      if (!step || !step.command) continue;
      const key = `${step.project}|${step.command}`;
      steps.set(key, { project: step.project, command: step.command, pkg });
    }
  }

  const lines = [];
  const stamp = new Date().toISOString();
  if (isWin) {
    lines.push('@echo off');
    lines.push(`REM npm-guardian fix script - generated ${stamp}`);
    lines.push('REM Review before running. This will modify your node_modules.');
    lines.push('');
    for (const step of steps.values()) {
      lines.push(`echo Fixing ${step.pkg} in ${step.project}...`);
      if (step.project === '(global)') lines.push(step.command);
      else lines.push(`cd /d "${step.project}" && ${step.command}`);
      lines.push('');
    }
  } else {
    lines.push('#!/bin/bash');
    lines.push(`# npm-guardian fix script - generated ${stamp}`);
    lines.push('# Review before running. This will modify your node_modules.');
    lines.push('');
    for (const step of steps.values()) {
      lines.push(`echo "Fixing ${step.pkg} in ${step.project}..."`);
      if (step.project === '(global)') lines.push(step.command);
      else lines.push(`cd "${step.project}" && ${step.command}`);
      lines.push('');
    }
  }

  await fsp.writeFile(file, `${lines.join('\n')}\n`, 'utf8');
  if (!isWin) await fsp.chmod(file, 0o755);
  return file;
}

module.exports = {
  writeFixScript
};
