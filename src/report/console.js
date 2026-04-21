"use strict";

const { SEVERITY_ORDER, COLORS } = require("../config/constants");
const { colorize } = require("../cli/output");
const { summarizeSeverities } = require("./common");

function printSummary(
  totalPackages,
  findings,
  options,
  metrics = null,
  resolutionSummary = [],
  suppressedCount = 0,
  policy = null,
  queryDiagnostics = null,
) {
  if (options.json) return;
  const sev = summarizeSeverities(findings);
  const vulnerablePackages = new Set(
    findings.map((f) => `${f.ecosystem}|${f.package}|${f.version}`),
  ).size;
  const clean = Math.max(0, totalPackages - vulnerablePackages);
  const line = "=".repeat(55);
  process.stdout.write(`${line}\n`);
  process.stdout.write("eco-guardian scan complete\n");
  process.stdout.write(
    `Packages scanned:  ${totalPackages.toLocaleString()} unique across selected ecosystems\n`,
  );
  process.stdout.write(
    `Findings:          ${findings.length} advisories found (${sev.critical} CRITICAL, ${sev.high} HIGH, ${sev.moderate} MODERATE)\n`,
  );
  process.stdout.write(`Vulnerable pkgs:   ${vulnerablePackages}\n`);
  process.stdout.write(`Clean packages:    ${clean.toLocaleString()}\n`);

  if (options.dependencyCheckMode) {
    process.stdout.write(
      `Dependency-check:  enabled (Java/NVD secondary enrichment)\n`,
    );
  }

  if (options.graphResolution && resolutionSummary.length > 0) {
    process.stdout.write("Graph resolution:\n");
    for (const item of resolutionSummary) {
      const reason = item.reason ? ` (fallback: ${item.reason})` : "";
      process.stdout.write(`  - ${item.ecosystem}: ${item.mode}${reason}\n`);
    }
  } else if (options.graphResolution) {
    process.stdout.write("Graph resolution: enabled\n");
  }

  if (suppressedCount > 0) {
    process.stdout.write(`Suppressed by baseline: ${suppressedCount}\n`);
  }

  if (policy && policy.enabled) {
    process.stdout.write(
      `Policy:            ${policy.passed ? "PASS" : "FAIL"}${policy.violations.length > 0 ? ` (${policy.violations.join(", ")})` : ""}\n`,
    );
  }

  if (queryDiagnostics) {
    process.stdout.write(
      `Provider retries:  ${queryDiagnostics.retries || 0}\n`,
    );
    if (queryDiagnostics.partialProviderFailure) {
      process.stdout.write("Provider status:   partial failures detected\n");
    }
    if (queryDiagnostics.nvdRequests > 0) {
      process.stdout.write(`NVD requests:      ${queryDiagnostics.nvdRequests}\n`);
    }
    if (queryDiagnostics.nvdErrors > 0) {
      process.stdout.write(`NVD errors:        ${queryDiagnostics.nvdErrors}\n`);
    }
  }

  if (metrics) {
    process.stdout.write(`Peak RAM:          ${metrics.peakRssMb} MB\n`);
    process.stdout.write(`Avg CPU:           ${metrics.avgCpuPercent}%\n`);
    process.stdout.write(`Scan Duration:     ${metrics.durationS}s\n`);
  }

  if (findings.length === 0 && totalPackages > 500) {
    const { log } = require("../cli/output");
    log(
      "vigil",
      "Your forest is vast, yet strangely silent. I suspect a trap.",
      options,
    );
  }

  process.stdout.write(`${line}\n`);
}

function padCell(value, width) {
  const text = String(value == null ? "" : value);
  if (text.length >= width) return text;
  return `${text}${" ".repeat(width - text.length)}`;
}

function severityRank(value) {
  const key = String(value || "").toLowerCase();
  return SEVERITY_ORDER[key] || 0;
}

function colorForSeverity(value) {
  const key = String(value || "").toLowerCase();
  if (key === "critical") return COLORS.red;
  if (key === "high") return COLORS.yellow;
  if (key === "moderate") return COLORS.cyan;
  if (key === "low") return COLORS.green;
  return COLORS.gray;
}

function colorSeverity(value, text) {
  return colorize(colorForSeverity(value), text);
}

function uniqueProjectCount(finding) {
  const seen = new Set();
  for (const item of finding.found_in || []) {
    if (item && item.project) seen.add(item.project);
  }
  return seen.size;
}

function renderFindingsTable(findings) {
  const sorted = findings.slice().sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    return String(a.package).localeCompare(String(b.package));
  });

  const cols = [
    { key: "severity", label: "SEVERITY" },
    { key: "ecosystem", label: "ECOSYSTEM" },
    { key: "package", label: "PACKAGE" },
    { key: "advisory", label: "ADVISORY" },
    { key: "projects", label: "PROJECTS" },
    { key: "locations", label: "LOCATIONS" },
    { key: "fix", label: "FIX" },
  ];

  const rows = sorted.map((finding) => ({
    severity: finding.severity || "N/A",
    ecosystem: finding.ecosystem || "npm",
    package: `${finding.package}@${finding.version}`,
    advisory: finding.advisory_id || "N/A",
    projects: String(uniqueProjectCount(finding)),
    locations: String((finding.found_in || []).length),
    fix:
      finding.fix_command ||
      finding.remediation_hint ||
      "Manual review required",
  }));

  const widths = {};
  for (const col of cols) {
    widths[col.key] = col.label.length;
  }
  for (const row of rows) {
    for (const col of cols) {
      const value = String(row[col.key] == null ? "" : row[col.key]);
      if (value.length > widths[col.key]) widths[col.key] = value.length;
    }
  }

  const header = `| ${cols.map((c) => padCell(c.label, widths[c.key])).join(" | ")} |`;
  const divider = `+-${cols.map((c) => "-".repeat(widths[c.key])).join("-+-")}-+`;
  const lines = [divider, header, divider];

  for (const row of rows) {
    const cells = cols.map((c) => {
      const padded = padCell(row[c.key], widths[c.key]);
      if (c.key === "severity") return colorSeverity(row.severity, padded);
      return padded;
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push(divider);
  return lines.join("\n");
}

function printFindingsDetailed(findings, options) {
  if (options.json) return;
  for (const finding of findings) {
    process.stdout.write(
      `\n ${colorSeverity(finding.severity, finding.severity)}  ${finding.package}@${finding.version}\n`,
    );
    process.stdout.write(
      `|- CVE: ${finding.cve || "N/A"} | ${finding.advisory_id} | CVSS: ${finding.cvss == null ? "N/A" : finding.cvss}\n`,
    );
    if (finding.source && finding.source !== "osv") {
      process.stdout.write(`|- Source: ${finding.source}${finding.match_confidence ? ` (confidence: ${finding.match_confidence})` : ""}\n`);
    }
    process.stdout.write(`|- ${finding.title}\n`);
    process.stdout.write(`|- Found in ${finding.found_in.length} locations:\n`);
    for (const entry of finding.found_in) {
      const via =
        entry.parent && entry.parent.name
          ? ` via ${entry.parent.name}${entry.parent.version ? `@${entry.parent.version}` : ""}`
          : "";
      process.stdout.write(
        `|   -> ${entry.manifest_path || entry.project} (${entry.dependency_type} dependency${via})\n`,
      );
    }
    if (finding.resolved_path) {
      process.stdout.write(`|- Path: ${finding.resolved_path.join(" -> ")}\n`);
    }
    if (finding.resolution_mode && finding.resolution_mode !== "inventory") {
      process.stdout.write(`|- Resolution: ${finding.resolution_mode}\n`);
    }
    if (
      Array.isArray(finding.fix_commands) &&
      finding.fix_commands.length > 0
    ) {
      process.stdout.write("|- Fix commands:\n");
      for (const cmd of finding.fix_commands) {
        process.stdout.write(`|   -> ${cmd}\n`);
      }
    } else if (finding.remediation_hint) {
      process.stdout.write(`|- Fix: ${finding.remediation_hint}\n`);
    } else {
      process.stdout.write("|- Fix: Manual review required\n");
    }
    const ref =
      (finding.references && finding.references[0]) ||
      `https://osv.dev/vulnerability/${finding.advisory_id}`;
    process.stdout.write(`' - More info: ${ref}\n`);
  }
}

function printFindingsHuman(findings, options) {
  if (options.json) return;
  process.stdout.write("\nFindings Table\n");
  process.stdout.write(`${renderFindingsTable(findings)}\n`);
  if (options.verbose) {
    process.stdout.write("\nDetailed Findings\n");
    printFindingsDetailed(findings, options);
  }
}

module.exports = {
  printSummary,
  printFindingsHuman,
  printFindingsDetailed,
  renderFindingsTable,
};
