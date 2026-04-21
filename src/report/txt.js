"use strict";

const fsp = require("fs/promises");
const path = require("path");
const { summarizeSeverities } = require("./common");

async function writeTxtReport(
  findings,
  packageCount,
  options,
  resolutionSummary = [],
  suppressedCount = 0,
  policy = null,
  queryDiagnostics = null,
) {
  if (!options.exportTxt) return null;
  const outFile = path.resolve(process.cwd(), options.exportTxt);
  const severity = summarizeSeverities(findings);
  const generatedAt = new Date().toISOString();

  const lines = [];
  lines.push("eco-guardian report");
  lines.push(`Generated: ${generatedAt}`);
  lines.push(`Packages scanned: ${packageCount}`);
  lines.push(
    `Vulnerabilities: ${findings.length} (Critical: ${severity.critical}, High: ${severity.high}, Moderate: ${severity.moderate}, Low: ${severity.low})`,
  );
  if (suppressedCount > 0) {
    lines.push(`Suppressed by baseline: ${suppressedCount}`);
  }
  if (policy && policy.enabled) {
    lines.push(
      `Policy: ${policy.passed ? "PASS" : "FAIL"}${policy.violations.length > 0 ? ` (${policy.violations.join(", ")})` : ""}`,
    );
  }
  if (queryDiagnostics) {
    lines.push(`Provider retries: ${queryDiagnostics.retries || 0}`);
    if (queryDiagnostics.partialProviderFailure) {
      lines.push("Provider status: partial failures detected");
    }
  }

  if (options.graphResolution && resolutionSummary.length > 0) {
    lines.push("");
    lines.push("Resolution Summary");
    lines.push("------------------");
    for (const item of resolutionSummary) {
      const reason = item.reason ? ` (fallback: ${item.reason})` : "";
      lines.push(`- ${item.ecosystem}: ${item.mode}${reason}`);
    }
  }
  lines.push("");
  lines.push("Findings");
  lines.push("--------");

  findings.forEach((finding, index) => {
    lines.push(
      `${index + 1}. ${finding.severity} | ${finding.ecosystem || "npm"} | ${finding.package}@${finding.version} | ${finding.advisory_id || "N/A"}`,
    );
    lines.push(`   Title: ${finding.title || finding.advisory_id || ""}`);
    if (finding.source && finding.source !== "osv") {
      lines.push(`   Source: ${finding.source}${finding.match_confidence ? ` (confidence: ${finding.match_confidence})` : ""}`);
    }
    lines.push(`   Locations: ${(finding.found_in || []).length}`);
    for (const entry of finding.found_in || []) {
      lines.push(
        `      -> ${entry.manifest_path || entry.project} (${entry.dependency_type || "dependency"})`,
      );
    }
    if (finding.resolved_path) {
      lines.push(`   Path: ${finding.resolved_path.join(" -> ")}`);
    }
    if (finding.resolution_mode && finding.resolution_mode !== "inventory") {
      lines.push(`   Resolution: ${finding.resolution_mode}`);
    }
    if (finding.fixed_version) {
      lines.push(`   Fixed version: ${finding.fixed_version}`);
    }
    if (
      Array.isArray(finding.fix_commands) &&
      finding.fix_commands.length > 0
    ) {
      lines.push("   Fix commands:");
      for (const cmd of finding.fix_commands) lines.push(`   - ${cmd}`);
    } else if (finding.remediation_hint) {
      lines.push(`   Remediation: ${finding.remediation_hint}`);
    } else {
      lines.push("   Fix: Manual review required");
    }
    const ref =
      (finding.references && finding.references[0]) ||
      `https://osv.dev/vulnerability/${finding.advisory_id}`;
    lines.push(`   Reference: ${ref}`);
    lines.push("");
  });

  await fsp.writeFile(outFile, `${lines.join("\n")}\n`, "utf8");
  return outFile;
}

module.exports = {
  writeTxtReport,
};
