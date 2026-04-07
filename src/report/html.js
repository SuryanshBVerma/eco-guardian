'use strict';

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { PLATFORM } = require('../config/constants');
const { summarizeSeverities, escapeHtml, severityClass } = require('./common');

async function writeHtmlReport(findings, packageCount, options) {
  if (!options.exportHtml) return null;
  const outFile = path.resolve(process.cwd(), options.exportHtml);
  const severity = summarizeSeverities(findings);
  const generatedAt = new Date();
  const nowLocal = generatedAt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const hostName = os.hostname();
  const userName = (() => {
    if (PLATFORM === 'win32') {
      const domain = process.env.USERDOMAIN || process.env.COMPUTERNAME || '';
      const user = process.env.USERNAME || os.userInfo().username || '';
      return domain ? `${domain}\\${user}` : user;
    }
    return process.env.USER || os.userInfo().username || '';
  })();

  const rows = findings.map((finding) => {
    const projectLines = (finding.found_in || []).map((entry) => {
      const via = entry.parent && entry.parent.name ? ` via ${entry.parent.name}${entry.parent.version ? `@${entry.parent.version}` : ''}` : '';
      return `${entry.project} (${entry.dependency_type}${via})`;
    });
    const fixLines = (Array.isArray(finding.fix_commands) && finding.fix_commands.length > 0)
      ? finding.fix_commands
      : [finding.fix_command || 'Manual review required'];
    return `<tr>
      <td><span class="sev ${severityClass(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
      <td>${escapeHtml(`${finding.package}@${finding.version}`)}</td>
      <td>${escapeHtml(finding.advisory_id || 'N/A')}</td>
      <td>${escapeHtml(finding.title || '')}</td>
      <td>${projectLines.map((p) => escapeHtml(p)).join('<br>')}</td>
      <td><code>${fixLines.map((cmd) => escapeHtml(cmd)).join('<br>')}</code></td>
      <td>${finding.references && finding.references[0] ? `<a href="${escapeHtml(finding.references[0])}">link</a>` : 'N/A'}</td>
    </tr>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>npm-guardian report</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #1f2937; }
    h1 { margin: 0 0 8px; }
    .meta { margin: 0 0 16px; color: #4b5563; }
    .stats { margin: 0 0 20px; }
    .sev { display: inline-block; padding: 2px 8px; border-radius: 999px; font-weight: 600; font-size: 12px; }
    .sev-critical { background: #7f1d1d; color: #fee2e2; }
    .sev-high { background: #9a3412; color: #ffedd5; }
    .sev-moderate { background: #92400e; color: #fef3c7; }
    .sev-low { background: #14532d; color: #dcfce7; }
    .sev-unknown { background: #374151; color: #f3f4f6; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f3f4f6; }
    code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>npm-guardian report</h1>
  <p class="meta">Host: ${escapeHtml(hostName)}<br>User: ${escapeHtml(userName)}<br>Generated: ${escapeHtml(nowLocal)}</p>
  <p class="stats">
    Packages scanned: ${packageCount.toLocaleString()}<br>
    Vulnerabilities: ${findings.length} (Critical: ${severity.critical}, High: ${severity.high}, Moderate: ${severity.moderate}, Low: ${severity.low})
  </p>
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Package</th>
        <th>Advisory</th>
        <th>Title</th>
        <th>Found In</th>
        <th>Fix</th>
        <th>Reference</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  await fsp.writeFile(outFile, html, 'utf8');
  return outFile;
}

module.exports = {
  writeHtmlReport
};
