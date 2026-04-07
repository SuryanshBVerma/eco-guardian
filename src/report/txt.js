'use strict';

const fsp = require('fs/promises');
const path = require('path');
const { summarizeSeverities } = require('./common');

async function writeTxtReport(findings, packageCount, options) {
  if (!options.exportTxt) return null;
  const outFile = path.resolve(process.cwd(), options.exportTxt);
  const severity = summarizeSeverities(findings);
  const generatedAt = new Date().toISOString();

  const lines = [];
  lines.push('npm-guardian report');
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Packages scanned: ${packageCount}`);
  lines.push(`Vulnerabilities: ${findings.length} (Critical: ${severity.critical}, High: ${severity.high}, Moderate: ${severity.moderate}, Low: ${severity.low})`);
  lines.push('');
  lines.push('Findings');
  lines.push('--------');

  findings.forEach((finding, index) => {
    lines.push(`${index + 1}. ${finding.severity} | ${finding.package}@${finding.version} | ${finding.advisory_id || 'N/A'}`);
    lines.push(`   Title: ${finding.title || ''}`);
    lines.push(`   Locations: ${(finding.found_in || []).length}`);
    if (Array.isArray(finding.fix_commands) && finding.fix_commands.length > 0) {
      lines.push('   Fix commands:');
      for (const cmd of finding.fix_commands) lines.push(`   - ${cmd}`);
    } else {
      lines.push('   Fix: Manual review required');
    }
    if (finding.references && finding.references[0]) lines.push(`   Reference: ${finding.references[0]}`);
    lines.push('');
  });

  await fsp.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  return outFile;
}

module.exports = {
  writeTxtReport
};
