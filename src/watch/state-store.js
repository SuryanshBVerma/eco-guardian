'use strict';

const fs = require('fs');
const path = require('path');
const { collectPackageMap, analyzePackageMap } = require('../app/run-scan');
const { discoverDependencyInputs } = require('../scan/discovery');
const { quickFingerprint } = require('./fingerprint');

async function loadWatchState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

async function saveWatchState(filePath, state) {
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  } catch (e) {
    // Suppress write errors if directory doesn't exist etc.
  }
}

function deriveProjectRoot(finding, inputDirs) {
  if (!finding.found_in || finding.found_in.length === 0) return "unknown";
  const entry = finding.found_in[0];
  const pathSample = typeof entry === "string" ? entry : (entry.path || entry.project || "");
  if (!pathSample) return "unknown";

  // Sort inputDirs by length descending to find the deepest match
  const match = inputDirs
    .filter((d) => pathSample.startsWith(d))
    .sort((a, b) => b.length - a.length)[0];
  return match || "global";
}

async function bootstrapState(options, runtimeState) {
  const collection = await collectPackageMap(options, runtimeState);
  const analysis = await analyzePackageMap(collection.packageMap, options, runtimeState, collection);

  const inputs = await discoverDependencyInputs(collection.rootsInfo.roots, options);
  const inputDirs = inputs.map((i) => (i.isDir ? i.path : path.dirname(i.path)));

  const inputFingerprints = {};
  for (const input of inputs) {
    inputFingerprints[input.path] = await quickFingerprint(input.path);
  }

  const snapshot = {
    options,
    inputs,
    inputFingerprints,
    findings: analysis.findings.map((f) => ({
      fingerprint: f.fingerprint,
      severity: f.severity,
      package: f.package,
      ecosystem: f.ecosystem,
      project: deriveProjectRoot(f, inputDirs),
    })),
    lastBootstrap: new Date().toISOString(),
  };

  if (options.stateFile) {
    await saveWatchState(options.stateFile, snapshot);
  }

  return snapshot;
}

module.exports = {
  loadWatchState,
  saveWatchState,
  bootstrapState
};
