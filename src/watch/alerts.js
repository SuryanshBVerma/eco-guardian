'use strict'

const runScan = require('../app/run-scan')
const {
  appendAlert,
  alreadyAlerted,
  markResolved,
  loadAlertLedger
} = require('./ledger')
const { saveWatchState } = require('./state-store')
const { log } = require('../cli/output')
const { SEVERITY_ORDER } = require('../config/constants')
const fs = require('fs')
const path = require('path')

function getSeverityRank (sev) {
  return SEVERITY_ORDER[String(sev).toLowerCase()] || 0
}

function selectNewNotifiableFindings (oldFindings, newFindings, options) {
  const oldMap = new Map(oldFindings.map((f) => [f.fingerprint, f]))
  const threshold = getSeverityRank(options.notifyOnSeverity || 'high')

  const newToNotify = []
  const resolved = []

  for (const f of newFindings) {
    if (!oldMap.has(f.fingerprint)) {
      if (getSeverityRank(f.severity) >= threshold) {
        newToNotify.push(f)
      }
    }
  }

  const newKeys = new Set(newFindings.map((f) => f.fingerprint))
  for (const f of oldFindings) {
    if (!newKeys.has(f.fingerprint)) {
      resolved.push(f)
    }
  }

  return { newToNotify, resolved }
}

async function processDirtyProjects (snapshot, dirtyProjectKeys, options) {
  const ledger = await loadAlertLedger(options.alertsFile)

  for (const key of dirtyProjectKeys) {
    if (!key) continue
    const [projectRoot, ecosystem] = key.split('|')
    log('info', `Rescanning project: ${projectRoot} (${ecosystem})`, options)

    const scopeOptions = {
      ...options,
      roots: [projectRoot],
      ecosystems: [ecosystem]
    }
    const collection = await runScan.collectPackageMap(scopeOptions, {})
    const analysis = await runScan.analyzePackageMap(
      collection.packageMap,
      scopeOptions,
      {},
      collection
    )

    const scopedOldFindings = snapshot.findings.filter(
      (f) =>
        path.resolve(f.project || '') === path.resolve(projectRoot) &&
        f.ecosystem === ecosystem
    )
    const { newToNotify, resolved } = selectNewNotifiableFindings(
      scopedOldFindings,
      analysis.findings,
      options
    )

    for (const f of newToNotify) {
      if (!alreadyAlerted(ledger, f.fingerprint)) {
        log(
          'warn',
          `NEW VULNERABILITY: ${f.severity.toUpperCase()} ${f.package} (${f.ecosystem})`,
          options
        )
        await appendAlert(
          {
            type: 'alert',
            fingerprint: f.fingerprint,
            severity: f.severity,
            package: f.package,
            ecosystem: f.ecosystem,
            project: projectRoot
          },
          options.alertsFile
        )

        if (options.alertsMd) {
          updateMarkdownDigest(options.alertsMd, f, 'NEW')
        }
      }
    }

    for (const f of resolved) {
      log('success', `RESOLVED: ${f.package} (${f.ecosystem})`, options)
      markResolved(ledger, f.fingerprint, options.alertsFile)
      if (options.alertsMd) {
        updateMarkdownDigest(options.alertsMd, f, 'RESOLVED')
      }
    }

    // Update snapshot findings for this project/ecosystem
    // We remove all old findings that belong to this PROJECT and ECOSYSTEM
    // and replace them with the newly discovered findings.
    const projectPath = path.resolve(projectRoot)
    snapshot.findings = snapshot.findings.filter((f) => {
      const fPath = path.resolve(f.project || '')
      return fPath !== projectPath || f.ecosystem !== ecosystem
    })

    const newFindings = analysis.findings.map((f) => ({
      fingerprint: f.fingerprint,
      severity: f.severity,
      package: f.package,
      ecosystem: f.ecosystem,
      project: projectRoot
    }))
    snapshot.findings.push(...newFindings)
  }

  if (options.stateFile) {
    await saveWatchState(options.stateFile, snapshot)
  }
}

function escapeMdCell (value) {
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ')
}

function updateMarkdownDigest (filePath, finding, status) {
  const line = `| ${new Date().toISOString()} | ${escapeMdCell(status)} | ${escapeMdCell(finding.severity.toUpperCase())} | ${escapeMdCell(finding.package)} | ${escapeMdCell(finding.ecosystem)} |\n`
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      '# eco-guardian Alert Digest\n\n| Timestamp | Status | Severity | Package | Ecosystem |\n| --- | --- | --- | --- | --- |\n'
    )
  }
  fs.appendFileSync(filePath, line)
}

module.exports = {
  selectNewNotifiableFindings,
  processDirtyProjects,
  updateMarkdownDigest
}
