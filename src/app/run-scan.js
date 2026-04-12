'use strict';

const path = require('path');
const { nowMs } = require('../shared/async');
const { log } = require('../cli/output');
const { discoverScanRoots, discoverNodeModules, discoverManifestFiles } = require('../scan/discovery');
const { harvestNpmPackages } = require('../scan/harvest');
const { collectMavenPackages } = require('../scan/maven');
const { collectNuGetPackages } = require('../scan/nuget');
const { collectVSCodeExtensions } = require('../scan/vscode');
const { collectPythonPackages } = require('../scan/python');
const { collectGoPackages } = require('../scan/go');
const { resolveEcosystemPackages } = require('../resolve');
const { queryVulnerabilities } = require('../vuln/query-service');
const { buildFindings } = require('../findings/builder');
const { printSummary, printFindingsHuman } = require('../report/console');
const { writeFixScript } = require('../report/fix-script');
const { writeTxtReport } = require('../report/txt');
const { writeHtmlReport } = require('../report/html');
const { ResourceMonitor } = require('../shared/monitor');

async function runScan(options, state = {}) {
  const phaseTimes = {};
  const counters = { found: 0, skippedPermissions: 0 };
  const monitor = new ResourceMonitor(options);
  if (options.benchmark) monitor.start();

  const rootsStart = nowMs();
  const rootsInfo = await discoverScanRoots(options, state);
  phaseTimes.roots = Date.now() - rootsStart;
  state.globalRoot = rootsInfo.globalRoot;

  log('info', 'Scanning roots:', options);
  for (const root of rootsInfo.roots) {
    const label = rootsInfo.globalRoot && path.resolve(root) === path.resolve(rootsInfo.globalRoot) ? ' (global)' : '';
    if (!options.json) process.stderr.write(`  -> ${root}${label}\n`);
  }
  if (state.globalRootUnavailable) log('warn', 'npm not found on PATH. Global packages were not scanned.', options);

  function mergePackageMaps(target, source) {
    for (const [key, record] of source.entries()) {
      const existing = target.get(key);
      if (!existing) {
        target.set(key, record);
      } else {
        existing.paths.push(...record.paths);
        existing.occurrences.push(...record.occurrences);
      }
    }
  }

  const discoveryStart = nowMs();
  let nodeModulesDirs = [];
  if (options.ecosystems.includes('npm')) {
    nodeModulesDirs = options.globalOnly
      ? rootsInfo.roots.filter((r) => path.basename(path.resolve(r)) === 'node_modules')
      : await discoverNodeModules(rootsInfo.roots, options, counters);
  }
  phaseTimes.discovery = Date.now() - discoveryStart;

  const harvestStart = nowMs();
  const packageMap = new Map();
  if (options.ecosystems.includes('npm')) {
    if (options.graphResolution) {
      const resolved = await resolveEcosystemPackages('npm', nodeModulesDirs.length > 0 ? nodeModulesDirs.map(d => path.dirname(d)) : rootsInfo.roots, options, state);
      mergePackageMaps(
        packageMap,
        resolved.usedFallback
          ? await harvestNpmPackages(nodeModulesDirs, options, state)
          : resolved.packageMap
      );
    } else {
      mergePackageMaps(packageMap, await harvestNpmPackages(nodeModulesDirs, options, state));
    }
  }
  if (options.ecosystems.includes('maven')) {
    if (options.graphResolution) {
      const resolved = await resolveEcosystemPackages('maven', rootsInfo.roots, options, state);
      mergePackageMaps(
        packageMap,
        resolved.usedFallback
          ? await collectMavenPackages(rootsInfo.roots, options, state)
          : resolved.packageMap
      );
    } else {
      mergePackageMaps(packageMap, await collectMavenPackages(rootsInfo.roots, options, state));
    }
  }
  if (options.ecosystems.includes('nuget')) {
    if (options.graphResolution) {
      const resolved = await resolveEcosystemPackages('nuget', rootsInfo.roots, options, state);
      mergePackageMaps(
        packageMap,
        resolved.usedFallback
          ? await collectNuGetPackages(rootsInfo.roots, options, state)
          : resolved.packageMap
      );
    } else {
      mergePackageMaps(packageMap, await collectNuGetPackages(rootsInfo.roots, options, state));
    }
  }
  if (options.ecosystems.includes('vscode')) {
    mergePackageMaps(packageMap, await collectVSCodeExtensions(rootsInfo.roots, options, state));
  }
  if (options.ecosystems.includes('python')) {
    if (options.graphResolution) {
      const resolved = await resolveEcosystemPackages('python', rootsInfo.roots, options, state);
      mergePackageMaps(
        packageMap,
        resolved.usedFallback
          ? await collectPythonPackages(rootsInfo.roots, options, state)
          : resolved.packageMap
      );
    } else {
      mergePackageMaps(packageMap, await collectPythonPackages(rootsInfo.roots, options, state));
    }
  }
  if (options.ecosystems.includes('go')) {
    if (options.graphResolution) {
      const resolved = await resolveEcosystemPackages('go', rootsInfo.roots, options, state);
      mergePackageMaps(
        packageMap,
        resolved.usedFallback
          ? await collectGoPackages(rootsInfo.roots, options, state)
          : resolved.packageMap
      );
    } else {
      mergePackageMaps(packageMap, await collectGoPackages(rootsInfo.roots, options, state));
    }
  }
  state.packageMap = packageMap;
  phaseTimes.harvest = Date.now() - harvestStart;

  const queryStart = nowMs();
  const vulnerabilityMap = await queryVulnerabilities(packageMap, options);
  phaseTimes.query = Date.now() - queryStart;

  const reportStart = nowMs();
  const findings = await buildFindings(packageMap, vulnerabilityMap, state);
  phaseTimes.report = Date.now() - reportStart;

  const fixFile = await writeFixScript(findings, options);
  const txtFile = await writeTxtReport(findings, packageMap.size, options);
  const htmlFile = await writeHtmlReport(findings, packageMap.size, options);
  const metrics = options.benchmark ? monitor.stop() : null;

  if (options.json) {
    process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`);
  } else {
    printSummary(packageMap.size, findings, options, metrics);
    if (findings.length === 0) process.stdout.write(`[OK] All clear. No known vulnerabilities found in ${packageMap.size.toLocaleString()} packages.\n`);
    else printFindingsHuman(findings, options);

    if (fixFile) log('success', `Fix script written to: ${fixFile}`, options);
    if (txtFile) log('success', `TXT report written to: ${txtFile}`, options);
    if (htmlFile) log('success', `HTML report written to: ${htmlFile}`, options);
    if (counters.skippedPermissions > 0) log('info', `Skipped ${counters.skippedPermissions} unreadable directories due to permissions.`, options);
  }

  if (options.verbose && !options.json) {
    const total = Object.values(phaseTimes).reduce((a, b) => a + b, 0);
    process.stderr.write(`Phase 1 (discovery):  ${(phaseTimes.discovery / 1000).toFixed(1)}s\n`);
    process.stderr.write(`Phase 2 (harvesting): ${(phaseTimes.harvest / 1000).toFixed(1)}s\n`);
    process.stderr.write(`Phase 3 (API query):  ${(phaseTimes.query / 1000).toFixed(1)}s\n`);
    process.stderr.write(`Phase 4 (reporting):  ${(phaseTimes.report / 1000).toFixed(1)}s\n`);
    process.stderr.write(`Total:                ${(total / 1000).toFixed(1)}s\n`);
  }

  return { findings, packageCount: packageMap.size };
}

module.exports = {
  runScan
};
