"use strict";

const os = require("os");
const fsp = require("fs/promises");
const path = require("path");
const { VERSION } = require("../config/constants");
const { summarizeSeverities, escapeHtml } = require("./common");

async function writeHtmlReport(
  findings,
  packageCount,
  options,
  resolutionSummary = [],
  suppressedCount = 0,
) {
  if (!options.exportHtml) return null;
  const outFile = path.resolve(process.cwd(), options.exportHtml);
  const severity = summarizeSeverities(findings);
  const generatedAt = new Date().toLocaleString();

  const resolutionHtml =
    options.graphResolution && resolutionSummary.length > 0
      ? `
        <div style="margin-bottom: 40px;">
            <div class="card-label">Resolution Status</div>
            <div class="summary-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 0;">
                ${resolutionSummary
                  .map(
                    (item) => `
                <div class="card" style="padding: 16px;">
                    <div class="card-label" style="font-size: 0.65rem;">${escapeHtml(item.ecosystem)}</div>
                    <div class="card-value" style="font-size: 1rem;">${escapeHtml(item.mode)}</div>
                    ${item.reason ? `<div class="meta" style="font-size: 0.65rem; margin-top: 4px;">Fallback: ${escapeHtml(item.reason)}</div>` : ""}
                </div>
                `,
                  )
                  .join("")}
            </div>
        </div>
    `
      : "";

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

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }

        .card {
            background: var(--card-bg);
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid var(--border-color);
        }

        .card-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            font-weight: 600;
            color: var(--text-muted);
            margin-bottom: 4px;
        }

        .card-value {
            font-size: 1.5rem;
            font-weight: 700;
        }

        .severity-critical { color: var(--critical); }
        .severity-high { color: var(--high); }
        .severity-moderate { color: var(--moderate); }
        .severity-low { color: var(--low); }

        .table-container {
            background: var(--card-bg);
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            background: #f1f5f9;
            padding: 12px 16px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border-color);
        }

        td {
            padding: 16px;
            vertical-align: top;
            border-bottom: 1px solid var(--border-color);
            font-size: 0.875rem;
        }

        tr:last-child td {
            border-bottom: none;
        }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
        }

        .badge-critical { background: #fee2e2; color: #991b1b; }
        .badge-high { background: #ffedd5; color: #9a3412; }
        .badge-moderate { background: #fef9c3; color: #854d0e; }
        .badge-low { background: #dbeafe; color: #1e40af; }

        .pkg-name { font-weight: 600; color: var(--primary); }
        .advisory-id { font-family: monospace; color: var(--text-muted); }
        
        .locations {
            margin-top: 8px;
            font-size: 0.75rem;
            color: var(--text-muted);
        }

        .remediation {
            margin-top: 4px;
            font-style: italic;
            color: var(--text-main);
        }

        .fix-commands-header {
            margin-top: 16px;
            font-size: 0.7rem;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--text-muted);
            letter-spacing: 0.05em;
        }

        .code-block {
            background: #1e293b;
            color: #f1f5f9;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
            font-size: 0.8rem;
            margin-top: 8px;
            white-space: pre-wrap;
            border: 1px solid #334155;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
        }

        .path-breadcrumb {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            align-items: center;
            margin-top: 6px;
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .path-step {
            background: #f1f5f9;
            padding: 1px 6px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
        }

        .path-sep {
            color: #94a3b8;
            font-weight: 700;
        }

        .path-vulnerable {
            background: #fee2e2;
            color: #991b1b;
            border-color: #fecaca;
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
            <div class="meta">Scan Path: ${escapeHtml(path.resolve(options.path))}${options.globalOnly ? " (Global Only)" : ""}</div>
            <div class="meta">Ecosystems: ${escapeHtml(options.ecosystems.join(", "))}</div>
            <div class="meta">Severity Threshold: ${escapeHtml(options.severity.toUpperCase())}${options.severity !== "critical" ? " and above" : ""}</div>
        </header>

        <div class="summary-grid">
            <div class="card">
                <div class="card-label">Packages Scanned</div>
                <div class="card-value">${packageCount.toLocaleString()}</div>
            </div>
            <div class="card">
                <div class="card-label">Total Vulnerabilities</div>
                <div class="card-value">${findings.length}</div>
            </div>
            <div class="card">
                <div class="card-label">Critical</div>
                <div class="card-value severity-critical">${severity.critical}</div>
            </div>
            <div class="card">
                <div class="card-label">High</div>
                <div class="card-value severity-high">${severity.high}</div>
            </div>
            ${
              suppressedCount > 0
                ? `
            <div class="card">
                <div class="card-label">Suppressed</div>
                <div class="card-value" style="color: var(--text-muted);">${suppressedCount}</div>
            </div>
            `
                : ""
            }
        </div>

        ${resolutionHtml}

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 100px;">Severity</th>
                        <th style="width: 100px;">Ecosystem</th>
                        <th style="width: 250px;">Package</th>
                        <th>Advisory / Details</th>
                        <th style="width: 450px;">Resolution</th>
                    </tr>
                </thead>
                <tbody>
                    ${findings
                      .map((f) => {
                        const sevClass = f.severity.toLowerCase();
                        const ref =
                          (f.references && f.references[0]) ||
                          `https://osv.dev/vulnerability/${f.advisory_id}`;
                        let remediation =
                          f.remediation_hint ||
                          (f.fixed_version
                            ? `Upgrade to **${f.fixed_version}**`
                            : "Manual review required");
                        remediation = escapeHtml(remediation).replace(
                          /\*\*(.*?)\*\*/g,
                          "<strong>$1</strong>",
                        );

                        const pathBreadcrumb =
                          f.resolved_path && f.resolved_path.length > 0
                            ? `<div class="path-breadcrumb">
                            ${f.resolved_path
                              .map(
                                (p, i) => `
                                <span class="path-step ${i === f.resolved_path.length - 1 ? "path-vulnerable" : ""}">${escapeHtml(p)}</span>
                                ${i < f.resolved_path.length - 1 ? '<span class="path-sep">/</span>' : ""}
                            `,
                              )
                              .join("")}
                          </div>`
                            : "";

                        return `
                    <tr>
                        <td><span class="badge badge-${sevClass}">${escapeHtml(f.severity)}</span></td>
                        <td>${escapeHtml(f.ecosystem || "npm")}</td>
                        <td>
                            <div class="pkg-name">${escapeHtml(f.package)}@${escapeHtml(f.version)}</div>
                            <div class="locations">Found in ${(f.found_in || []).length} locations</div>
                            ${pathBreadcrumb}
                            ${f.resolution_mode && f.resolution_mode !== "inventory" ? `<div class="locations" style="font-size: 0.65rem; opacity: 0.8;">Resolution: ${escapeHtml(f.resolution_mode)}</div>` : ""}
                        </td>
                        <td>
                            <div class="advisory-id"><a href="${escapeHtml(ref)}" target="_blank">${escapeHtml(f.advisory_id || "N/A")}</a></div>
                            <div style="margin-top: 4px; font-weight: 500;">${escapeHtml(f.title || "")}</div>
                            <div class="remediation" style="font-size: 0.8rem; margin-top: 8px;">${remediation}</div>
                        </td>
                        <td>
                            ${
                              f.fix_commands && f.fix_commands.length > 0
                                ? `
                                ${f.fix_commands.map((cmd) => `<div class="code-block">${escapeHtml(cmd)}</div>`).join("")}
                            `
                                : '<div class="remediation" style="font-style: normal; color: var(--text-muted);">Manual resolution required</div>'
                            }
                        </td>
                    </tr>`;
                      })
                      .join("")}
                    ${findings.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">No vulnerabilities found.</td></tr>' : ""}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`;

  await fsp.writeFile(outFile, html, "utf8");
  return outFile;
}

module.exports = {
  writeHtmlReport,
};
