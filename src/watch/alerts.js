'use strict';

const { collectPackageMap, analyzePackageMap } = require('../app/run-scan');
const { appendAlert, alreadyAlerted, markResolved, loadAlertLedger } = require('./ledger');
const { log } = require('../cli/output');
const { SEVERITY_ORDER } = require('../config/constants');
const fs = require('fs');
const path = require('path');

function getSeverityRank(sev) {
  return SEVERITY_ORDER[String(sev).toLowerCase()] || 0;
}

function selectNewNotifiableFindings(oldFindings, newFindings, options) {
  const oldMap = new Map(oldFindings.map(f => [f.fingerprint, f]));
  const threshold = getSeverityRank(options.notifyOnSeverity || 'high');

  const newToNotify = [];
  const resolved = [];

  for (const f of newFindings) {
    if (!oldMap.has(f.fingerprint)) {
      if (getSeverityRank(f.severity) >= threshold) {
        newToNotify.push(f);
      }
    }
  }

  const newKeys = new Set(newFindings.map(f => f.fingerprint));
  for (const f of oldFindings) {
    if (!newKeys.has(f.fingerprint)) {
      resolved.push(f);
    }
  }

  return { newToNotify, resolved };
}

async function processDirtyProjects(snapshot, dirtyProjectKeys, options) {
  const ledger = await loadAlertLedger(options.alertsFile);
  
  for (const key of dirtyProjectKeys) {
    if (!key) continue;
    const [projectRoot, ecosystem] = key.split('|');
    log('info', `Rescanning project: ${projectRoot} (${ecosystem})`, options);
    
    const scopeOptions = { ...options, path: projectRoot, pathExplicit: true, ecosystems: [ecosystem] };
    const collection = await collectPackageMap(scopeOptions, {});
    const analysis = await analyzePackageMap(collection.packageMap, scopeOptions, {}, collection);

    const { newToNotify, resolved } = selectNewNotifiableFindings(snapshot.findings, analysis.findings, options);

    for (const f of newToNotify) {
      if (!alreadyAlerted(ledger, f.fingerprint)) {
        log('warn', `NEW VULNERABILITY: ${f.severity.toUpperCase()} ${f.package} (${f.ecosystem})`, options);
        await appendAlert({ 
          type: 'alert', 
          fingerprint: f.fingerprint, 
          severity: f.severity, 
          package: f.package, 
          ecosystem: f.ecosystem,
          project: projectRoot
        }, options.alertsFile);
        
        if (options.alertsMd) {
          updateMarkdownDigest(options.alertsMd, f, 'NEW');
        }
      }
    }

    for (const f of resolved) {
      log('success', `RESOLVED: ${f.package} (${f.ecosystem})`, options);
      markResolved(ledger, f.fingerprint, options.alertsFile);
      if (options.alertsMd) {
        updateMarkdownDigest(options.alertsMd, f, 'RESOLVED');
      }
    }

    // Update snapshot findings for this project/ecosystem
    // We remove all old findings that belong to this PROJECT and ECOSYSTEM
    // and replace them with the newly discovered findings.
    const projectPath = path.resolve(projectRoot);
    snapshot.findings = snapshot.findings.filter(f => {
      const fPath = path.resolve(f.project || "");
      return fPath !== projectPath || f.ecosystem !== ecosystem;
    });

    const newFindings = analysis.findings.map(f => ({
      fingerprint: f.fingerprint,
      severity: f.severity,
      package: f.package,
      ecosystem: f.ecosystem,
      project: projectRoot
    }));
    snapshot.findings.push(...newFindings);
  }
}

function updateMarkdownDigest(filePath, finding, status) {
  const line = `| ${new Date().toISOString()} | ${status} | ${finding.severity.toUpperCase()} | ${finding.package} | ${finding.ecosystem} |\n`;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '# eco-guardian Alert Digest\n\n| Timestamp | Status | Severity | Package | Ecosystem |\n| --- | --- | --- | --- | --- |\n');
  }
  fs.appendFileSync(filePath, line);
}

module.exports = { selectNewNotifiableFindings, processDirtyProjects };
