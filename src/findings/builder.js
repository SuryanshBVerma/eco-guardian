'use strict';

const { enrichLocations } = require('./location');
const { pickBestFixedVersion, buildFixSteps, fixStepsToDisplayCommands } = require('./fix');

async function buildFindings(packageMap, vulnerabilityMap, state) {
  const findings = [];
  const globalRoot = state.globalRoot || null;

  for (const [key, record] of Object.entries(vulnerabilityMap)) {
    if (!record || !record.vulnerable || !Array.isArray(record.advisories) || record.advisories.length === 0) continue;
    const pkg = packageMap.get(key);
    if (!pkg) continue;

    const foundIn = await enrichLocations(pkg.paths, pkg.name, globalRoot);
    const fixedVersion = pickBestFixedVersion(record.advisories);
    const fixSteps = buildFixSteps(foundIn, pkg.name, fixedVersion);
    const fixCommands = fixStepsToDisplayCommands(fixSteps);
    const fixCommand = fixCommands.length === 0
      ? null
      : (fixCommands.length === 1 ? fixCommands[0] : `${fixCommands[0]} (+${fixCommands.length - 1} more)`);

    for (const advisory of record.advisories) {
      findings.push({
        package: pkg.name,
        version: pkg.version,
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
