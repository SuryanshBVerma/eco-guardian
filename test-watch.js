"use strict";

const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const {
  selectNewNotifiableFindings,
  processDirtyProjects,
} = require("./src/watch/alerts");
const { loadWatchState, saveWatchState } = require("./src/watch/state-store");
const runScan = require("./src/app/run-scan");

async function testScopedDiffing() {
  console.log("Testing Scoped Alert Diffing...");
  const oldFindings = [
    {
      fingerprint: "F1",
      project: "P1",
      ecosystem: "npm",
      severity: "high",
      package: "pkg1",
    },
    {
      fingerprint: "F2",
      project: "P2",
      ecosystem: "npm",
      severity: "high",
      package: "pkg2",
    },
  ];
  const newFindings = [
    {
      fingerprint: "F1",
      project: "P1",
      ecosystem: "npm",
      severity: "high",
      package: "pkg1",
    },
  ];

  const snapshot = { findings: oldFindings };
  const originalCollect = runScan.collectPackageMap;
  const originalAnalyze = runScan.analyzePackageMap;

  runScan.collectPackageMap = async () => ({
    packageMap: new Map(),
    rootsInfo: { roots: [] },
  });
  runScan.analyzePackageMap = async () => ({ findings: newFindings });

  try {
    await processDirtyProjects(snapshot, ["P1|npm"], {
      notifyOnSeverity: "high",
    });

    const fingerprints = snapshot.findings.map((f) => f.fingerprint);
    assert(fingerprints.includes("F1"), "P1 finding should be preserved");
    assert(
      fingerprints.includes("F2"),
      "P2 finding should NOT be removed when rescanning P1",
    );
  } finally {
    runScan.collectPackageMap = originalCollect;
    runScan.analyzePackageMap = originalAnalyze;
  }
  console.log("[PASS] Scoped diffing verified");
}

async function testStatePersistence() {
  console.log("Testing State Persistence Round-Trip...");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eco-watch-"));
  const testFile = path.join(tempDir, "test-snapshot.json");
  const state = { findings: [{ f: 1 }], lastBootstrap: "now" };

  try {
    await saveWatchState(testFile, state);
    const loaded = await loadWatchState(testFile);
    assert.deepStrictEqual(
      loaded,
      state,
      "State should be saved and loaded accurately",
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("[PASS] State persistence verified");
}

async function runTests() {
  try {
    await testScopedDiffing();
    await testStatePersistence();
    console.log("\nAll Watch Mode regression tests PASSED.");
  } catch (err) {
    console.error("\nTest FAILED:");
    console.error(err);
    process.exit(1);
  }
}

runTests();
