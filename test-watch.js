'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { selectNewNotifiableFindings, processDirtyProjects } = require('./src/watch/alerts');
const { loadWatchState, saveWatchState } = require('./src/watch/state-store');
const runScan = require('./src/app/run-scan');

async function testScopedDiffing() {
  console.log('Testing Scoped Alert Diffing...');
  const oldFindings = [
    { fingerprint: 'F1', project: 'P1', ecosystem: 'npm', severity: 'high', package: 'pkg1' },
    { fingerprint: 'F2', project: 'P2', ecosystem: 'npm', severity: 'high', package: 'pkg2' }
  ];
  const newFindings = [
    { fingerprint: 'F1', project: 'P1', ecosystem: 'npm', severity: 'high', package: 'pkg1' }
  ];
  
  // If we rescan P1, F1 should remain, and F2 (different project) should NOT be considered resolved.
  const snapshot = { findings: oldFindings };
  const originalCollect = runScan.collectPackageMap;
  const originalAnalyze = runScan.analyzePackageMap;
  
  runScan.collectPackageMap = async () => ({ packageMap: new Map(), rootsInfo: { roots: [] } });
  runScan.analyzePackageMap = async () => ({ findings: newFindings });

  try {
    await processDirtyProjects(snapshot, ['P1|npm'], { notifyOnSeverity: 'high' });
    
    // F1 exists in P1, F2 exists in P2. 
    // After rescanning P1, snapshot.findings should still have BOTH if they are stable.
    // In this test, newFindings for P1 matches oldFindings for P1, so nothing should be added/removed.
    const fingerprints = snapshot.findings.map(f => f.fingerprint);
    assert(fingerprints.includes('F1'), 'P1 finding should be preserved');
    assert(fingerprints.includes('F2'), 'P2 finding should NOT be removed when rescanning P1');
  } finally {
    runScan.collectPackageMap = originalCollect;
    runScan.analyzePackageMap = originalAnalyze;
  }
  console.log('✓ Scoped diffing verified');
}

async function testStatePersistence() {
  console.log('Testing State Persistence Round-Trip...');
  const testFile = 'test-snapshot.json';
  const state = { findings: [{ f: 1 }], lastBootstrap: 'now' };
  
  await saveWatchState(testFile, state);
  const loaded = await loadWatchState(testFile);
  assert.deepStrictEqual(loaded, state, 'State should be saved and loaded accurately');
  
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  console.log('✓ State persistence verified');
}

async function runTests() {
  try {
    await testScopedDiffing();
    await testStatePersistence();
    console.log('\nAll Watch Mode regression tests PASSED.');
  } catch (err) {
    console.error('\nTest FAILED:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
