'use strict';

const { enrichNpmLocations } = require('./location');
const { pickBestFixedVersion, buildFixSteps, fixStepsToDisplayCommands } = require('./fix');
const path = require('path');

async function buildFindings(packageMap, vulnerabilityMap, state) {
  const findings = [];
  const globalRoot = state.globalRoot || null;

  for (const [key, record] of Object.entries(vulnerabilityMap)) {
    if (!record || !record.vulnerable || !Array.isArray(record.advisories) || record.advisories.length === 0) continue;
    const pkg = packageMap.get(key);
    if (!pkg) continue;

    const foundIn = pkg.ecosystem === 'npm'
      ? await enrichNpmLocations(pkg.paths, pkg.name, globalRoot)
      : (pkg.occurrences || []);

    const fixedVersion = pickBestFixedVersion(record.advisories);
    const fixSteps = buildFixSteps({
      ecosystem: pkg.ecosystem,
      foundIn,
      packageName: pkg.name,
      fixedVersion
    });
    const fixCommands = fixStepsToDisplayCommands(fixSteps);
    const fixCommand = fixCommands.length === 0
      ? null
      : (fixCommands.length === 1 ? fixCommands[0] : `${fixCommands[0]} (+${fixCommands.length - 1} more)`);

    let remediationHint = null;
    if ((pkg.ecosystem === 'Maven' || pkg.ecosystem === 'NuGet') && fixedVersion) {
      const manifests = Array.from(new Set(foundIn.map(o => o.manifest_path).filter(Boolean)));
      if (manifests.length > 0) {
        remediationHint = `Update ${pkg.name} in ${manifests.map(p => path.basename(p)).join(', ')} to version ${fixedVersion}`;
      } else {
        remediationHint = `Update ${pkg.name} to version ${fixedVersion}`;
      }
    }

    for (const advisory of record.advisories) {
      findings.push({
        ecosystem: pkg.ecosystem,
        package: pkg.name,
        version: pkg.version,
        fixed_version: fixedVersion,
        remediation_hint: remediationHint,
        severity: advisory.severity,
        cvss: advisory.cvss_score,
        advisory_id: advisory.id,
        cve: advisory.cve || null,
        title: advisory.title,
        found_in: foundIn,
        fix_steps: fixSteps,
        fix_commands: fixCommands,
        fix_command: fixCommand,
        references: advisory.references || []
      });
    }
  }

  return findings;
}

module.exports = {
  buildFindings
};
