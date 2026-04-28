'use strict'

const os = require('os')
const fsp = require('fs/promises')
const path = require('path')
const { VERSION } = require('../config/constants')
const { summarizeSeverities, escapeHtml } = require('./common')

function severityRank (value) {
  const key = String(value || '').toLowerCase()
  if (key === 'critical') return 4
  if (key === 'high') return 3
  if (key === 'moderate') return 2
  if (key === 'low') return 1
  return 0
}

function sortFindings (findings) {
  return (findings || []).slice().sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity)
    if (sev !== 0) return sev
    const pkg = String(a.package || '').localeCompare(String(b.package || ''))
    if (pkg !== 0) return pkg
    return String(a.version || '').localeCompare(String(b.version || ''))
  })
}

function renderPathText (segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return 'Not available'
  }
  return escapeHtml(segments.join(' / '))
}

function renderLocationText (finding) {
  const entries = Array.isArray(finding.found_in) ? finding.found_in : []
  if (entries.length === 0) {
    return 'Not available'
  }

  return entries
    .map((entry) => {
      const label =
        entry.manifest_path || entry.project || '(unknown location)'
      const parent =
        entry.parent && entry.parent.name
          ? ` via ${entry.parent.name}${entry.parent.version ? `@${entry.parent.version}` : ''}`
          : ''
      return `${label}${parent}${entry.dependency_type ? ` (${entry.dependency_type})` : ''}`
    })
    .map((value) => escapeHtml(value))
    .join('; ')
}

function renderFixText (finding) {
  const commands = Array.isArray(finding.fix_commands)
    ? finding.fix_commands
    : finding.fix_command
      ? [finding.fix_command]
      : []

  if (commands.length > 0) {
    return commands
      .map((cmd) => `<pre class="command">${escapeHtml(cmd)}</pre>`)
      .join('')
  }

  return 'Manual review required.'
}

function renderFindingItem (finding) {
  const severity = String(finding.severity || 'N/A')
  const sevClass = severity.toLowerCase()
  const ref =
    (finding.references && finding.references[0]) ||
    `https://osv.dev/vulnerability/${finding.advisory_id}`
  const source = String(finding.source || 'osv')
  const sourceSuffix = finding.match_confidence
    ? ` (confidence: ${escapeHtml(finding.match_confidence)})`
    : ''
  const remediation = escapeHtml(
    finding.remediation_hint ||
      (finding.fixed_version
        ? `Upgrade to ${finding.fixed_version}`
        : 'Manual review required')
  ).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

  const locationCount = (
    Array.isArray(finding.found_in) ? finding.found_in : []
  ).length

  return `
        <article class="finding severity-${sevClass}">
            <div class="finding-head">
                <span class="badge badge-${sevClass}">${escapeHtml(severity)}</span>
                <span class="finding-title">${escapeHtml(finding.package)}@${escapeHtml(finding.version)}</span>
                <span class="finding-subtitle">${escapeHtml(finding.ecosystem || 'npm')} · ${escapeHtml(finding.advisory_id || 'N/A')} · CVSS ${finding.cvss == null ? 'N/A' : escapeHtml(finding.cvss)}</span>
            </div>
            <div class="finding-body">
                <div class="finding-line"><strong>Issue:</strong> ${escapeHtml(finding.title || finding.advisory_id || '')}</div>
                <div class="finding-line"><strong>Origin:</strong> Source ${escapeHtml(source)}${sourceSuffix}; Path ${renderPathText(finding.resolved_path)}; Locations ${locationCount}; ${renderLocationText(finding)}</div>
                <div class="finding-line"><strong>Fix:</strong> ${finding.fixed_version ? `Upgrade to ${escapeHtml(finding.fixed_version)}. ` : ''}${remediation}</div>
                <div class="finding-line"><a href="${escapeHtml(ref)}" target="_blank" rel="noreferrer">Advisory reference</a></div>
                <div class="finding-line">${renderFixText(finding)}</div>
            </div>
        </article>
    `
}

async function writeHtmlReport (
  findings,
  packageCount,
  options,
  resolutionSummary = [],
  suppressedCount = 0,
  policy = null,
  queryDiagnostics = null
) {
  if (!options.exportHtml) return null
  const outFile = path.resolve(process.cwd(), options.exportHtml)
  const severity = summarizeSeverities(findings)
  const generatedAt = new Date().toLocaleString()
  const sortedFindings = sortFindings(findings)

  const resolutionHtml =
    options.graphResolution && resolutionSummary.length > 0
      ? `
                <div class="resolution-line">
                        <strong>Resolution:</strong>
                        ${resolutionSummary.map((item) => `${escapeHtml(item.ecosystem)} ${escapeHtml(item.mode)}${item.reason ? ` (${escapeHtml(item.reason)})` : ''}`).join('; ')}
                </div>
    `
      : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>eco-guardian Security Report</title>
    <style>
        :root {
            --bg-color: #f8fafc;
            --card-bg: #ffffff;
            --text-main: #1e293b;
            --text-muted: #64748b;
            --border-color: #e2e8f0;
            --primary: #2563eb;
            --critical: #ef4444;
            --high: #f97316;
            --moderate: #eab308;
            --low: #3b82f6;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            margin: 0;
            padding: 40px 20px;
            line-height: 1.5;
        }

        .container {
            max-width: 95%;
            margin: 0 auto;
        }

        header {
            margin-bottom: 40px;
        }

        h1 {
            font-size: 2.25rem;
            font-weight: 800;
            margin: 0 0 8px 0;
            letter-spacing: -0.025em;
        }

        .meta {
            color: var(--text-muted);
            font-size: 0.875rem;
        }

        .summary-strip {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 20px 0 24px;
        }

        .chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            border: 1px solid var(--border-color);
            border-radius: 999px;
            background: var(--card-bg);
            font-size: 0.85rem;
            color: var(--text-main);
        }

        .chip strong {
            font-weight: 600;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 600;
            letter-spacing: 0.02em;
        }

        .badge-critical { background: #fee2e2; color: #991b1b; }
        .badge-high { background: #ffedd5; color: #9a3412; }
        .badge-moderate { background: #fef9c3; color: #854d0e; }
        .badge-low { background: #dbeafe; color: #1e40af; }

        .finding-list {
            display: grid;
            gap: 12px;
        }

        .finding {
            border: 1px solid var(--border-color);
            border-radius: 12px;
            background: var(--card-bg);
            padding: 14px 16px;
        }

        .finding-head {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }

        .finding-title {
            font-weight: 600;
            color: var(--text-main);
        }

        .finding-subtitle {
            color: var(--text-muted);
            font-size: 0.82rem;
        }

        .finding-body {
            margin-top: 10px;
            display: grid;
            gap: 6px;
        }

        .finding-line {
            font-size: 0.92rem;
            color: var(--text-muted);
        }

        .finding-line strong {
            color: var(--text-main);
            font-weight: 600;
        }

        .command {
            margin: 4px 0 0;
            padding: 8px 10px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            background: #f8fafc;
            color: var(--text-main);
            font-size: 0.82rem;
            white-space: pre-wrap;
        }

        .resolution-line {
            margin: 0 0 24px;
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        .empty-state {
            color: var(--text-muted);
            font-size: 0.9rem;
        }

        a { color: var(--primary); text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Security Report</h1>
            <div class="meta">Generated by <strong>eco-guardian v${VERSION}</strong> on ${escapeHtml(generatedAt)}</div>
            <div class="meta">Machine: ${escapeHtml(os.hostname())} (${escapeHtml(os.platform())} ${escapeHtml(os.arch())})</div>
            <div class="meta">User: ${escapeHtml(os.userInfo().username)}</div>
            <div class="meta">Scan Path: ${escapeHtml(path.resolve(options.path))}${options.globalOnly ? ' (Global Only)' : ''}</div>
            <div class="meta">Ecosystems: ${escapeHtml(options.ecosystems.join(', '))}</div>
            <div class="meta">Severity Threshold: ${escapeHtml(options.severity.toUpperCase())}${options.severity !== 'critical' ? ' and above' : ''}</div>
        </header>

        <div class="summary-strip">
            <div class="chip"><strong>Packages</strong> ${packageCount.toLocaleString()}</div>
            <div class="chip"><strong>Vulnerabilities</strong> ${findings.length}</div>
            <div class="chip"><strong>Critical</strong> ${severity.critical}</div>
            <div class="chip"><strong>High</strong> ${severity.high}</div>
            <div class="chip"><strong>Moderate</strong> ${severity.moderate}</div>
            <div class="chip"><strong>Low</strong> ${severity.low}</div>
            ${suppressedCount > 0 ? `<div class="chip"><strong>Suppressed</strong> ${suppressedCount}</div>` : ''}
            ${policy && policy.enabled ? `<div class="chip"><strong>Policy</strong> ${policy.passed ? 'PASS' : 'FAIL'}${policy.violations.length > 0 ? ` (${escapeHtml(policy.violations.join(', '))})` : ''}</div>` : ''}
            ${queryDiagnostics ? `<div class="chip"><strong>Retries</strong> ${Number(queryDiagnostics.retries || 0)}</div>` : ''}
        </div>

        ${resolutionHtml}

        <section class="finding-list">
            ${sortedFindings.length > 0 ? sortedFindings.map((finding) => renderFindingItem(finding)).join('') : '<div class="empty-state">No vulnerabilities found.</div>'}
        </section>
    </div>
</body>
</html>`

  await fsp.writeFile(outFile, html, 'utf8')
  return outFile
}

module.exports = {
  writeHtmlReport
}
