"use strict";

const path = require("path");
const { nowMs } = require("../shared/async");
const { log } = require("../cli/output");
const {
  discoverScanRoots,
  discoverNodeModules,
  isRipgrepAvailable,
} = require("../scan/discovery");
const { harvestNpmPackages } = require("../scan/harvest");
const { collectMavenPackages } = require("../scan/maven");
const { collectGradlePackages } = require("../scan/gradle");
const { collectNuGetPackages } = require("../scan/nuget");
const { collectVSCodeExtensions } = require("../scan/vscode");
const { collectPythonPackages } = require("../scan/python");
const { collectGoPackages } = require("../scan/go");
const { collectRubyPackages } = require("../scan/ruby");
const { collectRustPackages } = require("../scan/rust");
const { collectPhpPackages } = require("../scan/php");
const { collectDartPackages } = require("../scan/dart");
const { collectElixirPackages } = require("../scan/elixir");
const { collectConanPackages } = require("../scan/conan");
const { collectHaskellPackages } = require("../scan/haskell");
const { collectSwiftPackages } = require("../scan/swift");
const { collectRPackages } = require("../scan/r");
const { queryVulnerabilities } = require("../vuln/query-service");
const { buildFindings } = require("../findings/builder");
const {
  printSummary,
  printFindingsHuman,
  printFindingsDetailed,
} = require("../report/console");
const { writeFixScript } = require("../report/fix-script");
const { writeTxtReport } = require("../report/txt");
const { writeHtmlReport } = require("../report/html");
const { writeJsonReport } = require("../report/json");
const { writeCsvReport } = require("../report/csv");
const { ResourceMonitor } = require("../shared/monitor");
const { loadBaseline, applyBaseline, writeBaseline } = require("../baseline");
const { writeSarifReport } = require("../report/sarif");
const { resolveEcosystemPackages } = require("../resolve");
const {
  DEFAULT_BASELINE_FILE,
  POLICY_FAIL_EXIT_CODE,
} = require("../config/constants");
const { evaluatePolicy } = require("../policy/gates");
const musing = require("../cli/musing");

/**
 * Discovers and harvests packages across all requested ecosystems.
 *
 * @param {object} options - Parsed CLI options.
 * @param {object} [state] - Mutable runtime state.
 * @returns {Promise<{ packageMap: Map, resolutionSummary: object[], phaseTimes: object, counters: object, rootsInfo: object }>}
 */
async function collectPackageMap(options, state = {}) {
  const phaseTimes = { discovery: 0, harvest: 0, roots: 0 };
  const counters = { found: 0, skippedPermissions: 0 };
  const resolutionSummary = [];

  const rootsStart = nowMs();
  const rootsInfo = await discoverScanRoots(options, state);
  phaseTimes.roots = Date.now() - rootsStart;
  state.globalRoot = rootsInfo.globalRoot;

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
  if (options.ecosystems.includes("npm")) {
    nodeModulesDirs = options.globalOnly
      ? rootsInfo.roots.filter(
          (r) => path.basename(path.resolve(r)) === "node_modules",
        )
      : await discoverNodeModules(rootsInfo.roots, options, counters);
  }
  phaseTimes.discovery = Date.now() - discoveryStart;

  const harvestStart = nowMs();
  const packageMap = new Map();

  const HARVESTERS = {
    npm: {
      collect: () => harvestNpmPackages(nodeModulesDirs, options, state),
      resolverRoots:
        nodeModulesDirs.length > 0
          ? nodeModulesDirs.map((d) => path.dirname(d))
          : rootsInfo.roots,
    },
    maven: {
      collect: () => collectMavenPackages(rootsInfo.roots, options, state),
    },
    gradle: {
      collect: () => collectGradlePackages(rootsInfo.roots, options, state),
    },
    nuget: {
      collect: () => collectNuGetPackages(rootsInfo.roots, options, state),
    },
    vscode: {
      collect: () => collectVSCodeExtensions(rootsInfo.roots, options, state),
    },
    python: {
      collect: () => collectPythonPackages(rootsInfo.roots, options, state),
    },
    go: { collect: () => collectGoPackages(rootsInfo.roots, options, state) },
    ruby: {
      collect: () => collectRubyPackages(rootsInfo.roots, options, state),
    },
    rust: {
      collect: () => collectRustPackages(rootsInfo.roots, options, state),
    },
    php: { collect: () => collectPhpPackages(rootsInfo.roots, options, state) },
    dart: {
      collect: () => collectDartPackages(rootsInfo.roots, options, state),
    },
    elixir: {
      collect: () => collectElixirPackages(rootsInfo.roots, options, state),
    },
    conan: {
      collect: () => collectConanPackages(rootsInfo.roots, options, state),
    },
    haskell: {
      collect: () => collectHaskellPackages(rootsInfo.roots, options, state),
    },
    swift: {
      collect: () => collectSwiftPackages(rootsInfo.roots, options, state),
    },
    r: { collect: () => collectRPackages(rootsInfo.roots, options, state) },
  };

  const { GRAPH_RESOLUTION_SUPPORT } = require("../config/constants");
  for (const ecosystem of options.ecosystems) {
    const cfg = HARVESTERS[ecosystem];
    if (!cfg) continue;
    const support = GRAPH_RESOLUTION_SUPPORT[ecosystem];
    if (options.graphResolution && support !== "not_applicable") {
      const roots = cfg.resolverRoots || rootsInfo.roots;
      const resolved = await resolveEcosystemPackages(
        ecosystem,
        roots,
        options,
        state,
      );
      resolutionSummary.push({
        ecosystem,
        mode: resolved.mode,
        reason: resolved.reason,
      });
      mergePackageMaps(
        packageMap,
        resolved.usedFallback ? await cfg.collect() : resolved.packageMap,
      );
    } else {
      mergePackageMaps(packageMap, await cfg.collect());
    }
  }
  phaseTimes.harvest = Date.now() - harvestStart;

  return {
    packageMap,
    resolutionSummary,
    phaseTimes,
    counters,
    rootsInfo,
  };
}

/**
 * Queries vulnerabilities for the collected packages, builds findings,
 * applies baselines, evaluates policy, and writes reports.
 *
 * @param {Map} packageMap - Harvested packages keyed by ecosystem|name|version.
 * @param {object} options - Parsed CLI options.
 * @param {object} [state] - Mutable runtime state.
 * @param {object} [metadata] - Phase timings and resolution summary from collection.
 * @returns {Promise<{ findings: object[], packageCount: number, policy: object|null, exitCode: number }>}
 */
async function analyzePackageMap(
  packageMap,
  options,
  state = {},
  metadata = {},
) {
  const { phaseTimes = {}, resolutionSummary = [], counters = {} } = metadata;

  const queryStart = nowMs();
  const vulnerabilityMap = await queryVulnerabilities(packageMap, options);
  const queryDiagnostics = vulnerabilityMap.__diagnostics || null;
  phaseTimes.query = Date.now() - queryStart;

  const reportStart = nowMs();
  const findings = await buildFindings(packageMap, vulnerabilityMap, state);
  phaseTimes.report = Date.now() - reportStart;

  const fixFile = await writeFixScript(findings, options);

  const baselineFile = options.baseline || DEFAULT_BASELINE_FILE;
  const baseline = await loadBaseline(baselineFile, options);
  const { findings: visibleFindings, suppressedCount } = applyBaseline(
    findings,
    baseline,
  );
  const policy = evaluatePolicy(visibleFindings, options);

  if (options.writeBaseline) {
    await writeBaseline(findings, options.writeBaseline);
    log("success", `Baseline written to: ${options.writeBaseline}`, options);
  }

  const jsonFile = await writeJsonReport(visibleFindings, options);
  const csvFile = await writeCsvReport(visibleFindings, options);

  const txtFile = await writeTxtReport(
    visibleFindings,
    packageMap.size,
    options,
    resolutionSummary,
    suppressedCount,
    policy,
    queryDiagnostics,
  );
  const htmlFile = await writeHtmlReport(
    visibleFindings,
    packageMap.size,
    options,
    resolutionSummary,
    suppressedCount,
    policy,
    queryDiagnostics,
  );
  const sarifFile = await writeSarifReport(
    visibleFindings,
    packageMap.size,
    options,
    resolutionSummary,
    suppressedCount,
    policy,
    queryDiagnostics,
  );

  const finalFindings = options.why
    ? visibleFindings.filter(
        (f) =>
          f.package.toLowerCase().includes(options.why.toLowerCase()) ||
          f.ecosystem.toLowerCase() === options.why.toLowerCase(),
      )
    : visibleFindings;

  const metrics = metadata.metrics || null;

  if (options.json) {
    process.stdout.write(`${JSON.stringify(finalFindings, null, 2)}\n`);
  } else {
    musing.stop();
    printSummary(
      packageMap.size,
      finalFindings,
      options,
      metrics,
      resolutionSummary,
      suppressedCount,
      policy,
      queryDiagnostics,
    );
    if (finalFindings.length === 0 && !options.why) {
      process.stdout.write(
        `[OK] All clear. No known vulnerabilities found in ${packageMap.size.toLocaleString()} packages.\n`,
      );
    } else {
      if (options.why) {
        process.stdout.write(`\nWhy report for "${options.why}"\n`);
        printFindingsDetailed(finalFindings, options);
      } else {
        printFindingsHuman(finalFindings, options);
      }
    }

    if (fixFile) log("success", `Fix script written to: ${fixFile}`, options);
    if (jsonFile) {
      log("success", `JSON report written to: ${jsonFile}`, options);
    }
    if (csvFile) log("success", `CSV report written to: ${csvFile}`, options);
    if (txtFile) log("success", `TXT report written to: ${txtFile}`, options);
    if (htmlFile) {
      log("success", `HTML report written to: ${htmlFile}`, options);
    }
    if (sarifFile) {
      log("success", `SARIF report written to: ${sarifFile}`, options);
    }

    if (counters.skippedPermissions > 0) {
      log(
        "info",
        `Skipped ${counters.skippedPermissions} unreadable directories due to permissions.`,
        options,
      );
    }
    if (policy.enabled) {
      if (policy.passed) {
        log("success", "Policy gate: PASSED", options);
      } else {
        log(
          "warn",
          `Policy gate: FAILED (${policy.violations.join(", ")})`,
          options,
        );
      }
    }
  }

  if (options.verbose && !options.json) {
    const total = Object.values(phaseTimes).reduce((a, b) => a + b, 0);
    process.stderr.write(
      `Phase 1 (discovery):  ${(phaseTimes.discovery / 1000).toFixed(1)}s\n`,
    );
    process.stderr.write(
      `Phase 2 (harvesting): ${(phaseTimes.harvest / 1000).toFixed(1)}s\n`,
    );
    process.stderr.write(
      `Phase 3 (API query):  ${(phaseTimes.query / 1000).toFixed(1)}s\n`,
    );
    process.stderr.write(
      `Phase 4 (reporting):  ${(phaseTimes.report / 1000).toFixed(1)}s\n`,
    );
    process.stderr.write(
      `Total:                ${(total / 1000).toFixed(1)}s\n`,
    );
  }

  const exitCode =
    policy.enabled && !policy.passed
      ? POLICY_FAIL_EXIT_CODE
      : visibleFindings.length > 0
        ? 1
        : 0;

  return {
    findings: visibleFindings,
    packageCount: packageMap.size,
    policy,
    queryDiagnostics,
    exitCode,
  };
}

/**
 * Orchestrates the full scan: discovery, harvesting, vulnerability querying,
 * and reporting. Returns an object with findings, packageCount, policy, and exitCode.
 *
 * @param {object} options - Parsed CLI options.
 * @param {object} [state] - Mutable runtime state (e.g., interrupted flag).
 * @returns {Promise<{ findings: object[], packageCount: number, policy: object|null, exitCode: number }>}
 */
async function runScan(options, state = {}) {
  const monitor = new ResourceMonitor(options);
  let monitorStopped = false;

  if (options.benchmark) monitor.start();
  if (!options.json) musing.start();

  try {
    if (!options.json) {
      const rgActive = await isRipgrepAvailable();
      log(
        "info",
        `Discovery Mode: ${rgActive ? "Ripgrep (High Performance)" : "Standard (Native Fallback)"}`,
        options,
      );

      if (
        path.resolve(options.path) === path.resolve(__dirname, "../../") ||
        path.resolve(options.path) === path.resolve(process.cwd())
      ) {
        const pkgName = require("../../package.json").name;
        if (
          [
            "@npm-guardian/eco-guardian",
            "npm-guardian",
            "eco-guardian",
          ].includes(pkgName)
        ) {
          log(
            "info",
            "I have gazed into my own soul. It is clean... for now.",
            options,
          );
        }
      }
    }

    const collection = await collectPackageMap(options, state);
    const metrics = options.benchmark ? monitor.stop() : null;
    if (options.benchmark) monitorStopped = true;

    return analyzePackageMap(collection.packageMap, options, state, {
      ...collection,
      metrics,
    });
  } finally {
    if (!options.json) musing.stop();
    if (options.benchmark && !monitorStopped) {
      monitor.stop();
    }
  }
}

module.exports = {
  collectPackageMap,
  analyzePackageMap,
  runScan,
};
