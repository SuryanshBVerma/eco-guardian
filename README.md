# eco-guardian

eco-guardian is a Node.js CLI that scans local machines for vulnerable packages across npm, Maven, Gradle, NuGet, VSCode extensions, Python, and Go.

It discovers dependencies locally, queries OSV (and npm advisories for npm packages), and can optionally run a Java-only dependency-check-style mode that performs CPE/CVE matching against NVD for Maven/Gradle dependencies.
Then it reports findings in console/JSON and export formats.

## Setup

### Run without cloning

```bash
npx github:boredom1234/eco-guardian
```

### Run from source

```bash
npm install
node eco-guardian.js
```

## Usage

```bash
node eco-guardian.js [options]
```

Common examples:

```bash
node eco-guardian.js --path ~/projects --severity high
node eco-guardian.js --ecosystems npm,maven,gradle,nuget,vscode,python,go
node eco-guardian.js --graph-resolution --ecosystems npm,maven
node eco-guardian.js --export-sarif results.sarif
node eco-guardian.js --export-json results.json --export-csv results.csv
node eco-guardian.js --baseline .eco-guardian-baseline.json --strict-baseline
node eco-guardian.js --fail-on-severity high --max-critical 0 --max-high 5
```

## Options

| Flag                         | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `--path <dir>`               | Scan only this path.                                                         |
| `--ecosystems <list>`        | Comma-separated ecosystems: `npm,maven,gradle,nuget,vscode,python,go`.              |
| `--global-only`              | Scan only global npm installs.                                               |
| `--severity <level>`         | Minimum severity: `low`, `moderate`, `high`, `critical`.                     |
| `--json`                     | Print findings JSON to stdout.                                               |
| `--banner <on|off>`          | Toggle CLI chrome/progress output (`off` shows final result output only).    |
| `--no-cache`                 | Disable local vulnerability cache.                                           |
| `--fix`                      | Generate fix scripts (`eco-guardian-fixes.ps1` and `eco-guardian-fixes.sh`). |
| `--export-txt <file>`        | Write TXT report.                                                            |
| `--export-html <file>`       | Write HTML report.                                                           |
| `--export-sarif <file>`      | Write SARIF 2.1.0 report.                                                    |
| `--export-json <file>`       | Write JSON findings file.                                                    |
| `--export-csv <file>`        | Write CSV findings file.                                                     |
| `--baseline <file>`          | Apply suppression baseline (default file: `.eco-guardian-baseline.json`).    |
| `--write-baseline <file>`    | Write current findings as a baseline file.                                   |
| `--strict-baseline`          | Error when an explicit baseline file is missing or invalid JSON.             |
| `--fail-on-severity <level>` | Policy gate failure if any finding is at or above this level.                |
| `--max-critical <n>`         | Policy gate failure if critical findings exceed `n`.                         |
| `--max-high <n>`             | Policy gate failure if high findings exceed `n`.                             |
| `--why <package>`            | Show dependency path and remediation context for one package/ecosystem.      |
| `--benchmark`                | Show peak RAM, average CPU, and scan duration.                               |
| `--watch`                    | Run eco-guardian as a long-lived incremental monitor.                       |
| `--notify-on-severity <level>`| Alert only on new findings at or above this severity (default: `high`).     |
| `--state-file <file>`         | Persistent watch snapshot file.                                              |
| `--alerts-file <file>`        | Append-only JSONL alert ledger (default: `eco-guardian-alerts.jsonl`).       |
| `--alerts-md <file>`          | Human-readable Markdown alert digest.                                        |
| `--reconcile-interval <sec>`  | Low-frequency safety sweep interval (default: `900`).                        |
| `--watch-debounce-ms <ms>`    | Debounce dirty-project rescans (default: `1500`).                            |
| `--verbose`                  | Print full advisory details in console mode.                                 |
| `--graph-resolution`         | Resolve dependency graphs with native ecosystem tooling.                     |
| `--dependency-check-mode`    | Java-only secondary analysis using CPE/CVE matching against NVD.            |
| `--nvd-api-key <key>`        | NVD API key for higher rate limits (optional).                              |
| `--global`                   | On Unix-like systems, include `/` root scan.                                 |
| `--all-drives`               | Full-machine scan mode.                                                      |
| `--help`                     | Print help.                                                                  |
| `--version`                  | Print version.                                                               |

## Continuous Watch Mode

`eco-guardian --watch` performs one bootstrap scan, builds a dependency-input index, and then watches only relevant package manifests and sentinel directories (like `node_modules`).

When an input changes:
1.  eco-guardian rescans **only** the affected project/ecosystem.
2.  The vulnerability cache is reused where possible to minimize latency.
3.  New findings are compared against the bootstrap snapshot.
4.  Notifications are dispatched only for newly introduced findings that pass the `--notify-on-severity` threshold and are not in the baseline.

Note: Because `fs.watch()` behavior varies by platform, a background reconciliation pass periodically sweeps the index to ensure no events were missed.

### Alert History

- **JSONL Ledger**: All alerts and resolutions are logged to `--alerts-file` (default: `eco-guardian-alerts.jsonl`). This file serves as the authoritative history for deduplication.
- **Markdown Digest**: An optional, human-readable table can be maintained via `--alerts-md`.
- **State Snapshot**: The watcher's current view of the world is persisted in `--state-file` to allow for incremental resumes (planned).

## Discovery and Resolution Notes

- Discovery engine priority:
  1.  `rg` (ripgrep) when available
  2.  Native tools (`mdfind` on macOS, `locate` on Linux, `dir` on Windows)
  3.  Recursive Node.js filesystem walker fallback
- Default root behavior:
  - If `--path` is provided, scan that path
  - If `--global-only` is set, scan only npm global root
  - Without `--path`, Windows discovers readable drives; Unix-like systems start from home (plus `/` when `--global` or `--all-drives` is set)

Graph resolution support matrix:

| Ecosystem | Support        |
| --------- | -------------- |
| npm       | supported      |
| maven     | supported      |
| gradle    | supported      |
| nuget     | supported      |
| go        | supported      |
| python    | partial        |
| vscode    | not applicable |

When graph resolution is unavailable or fails for a given ecosystem, scanning falls back to inventory collection for that ecosystem.

## Outputs and Exit Codes

- Console summary includes counts, resolution mode details, baseline suppression count, and (when configured) policy status.
- TXT/HTML/SARIF exports are available.
- JSON/CSV exports are available via `--export-json` and `--export-csv`.
- Policy-gated runs can return a dedicated exit code.

Exit codes:

- `0`: no visible findings
- `1`: findings present
- `2`: scan/runtime error
- `3`: policy gate failed (`--fail-on-severity`, `--max-critical`, `--max-high`)

### Java Dependency-Check Mode (Experimental)

When enabled with `--dependency-check-mode`, eco-guardian performs secondary analysis for Maven and Gradle ecosystems by matching resolved package coordinates to NVD CPEs and querying the NVD CVE API.

**Limitations:**
- **Java-only:** Only affects `maven` and `gradle` ecosystems in v1.
- **Heuristic:** CPE matching is based on heuristics and may yield false positives or negatives.
- **No caching:** NVD results are queried fresh on every scan and are not cached to ensure data accuracy.
- **Rate limiting:** Without an NVD API key, the scan may be throttled for large dependency sets.

---

## Scripts

```bash
npm start
npm test
npm run coverage
npm run coverage:check
```

`npm test` runs:

- `node test.js`
- `node test-resolvers.js`
- `node test-gradle.js`
- `node test-coverage.js`

`test-ripgrep.js` exists in the repo but is not part of the default `npm test` script.

## Configuration

Environment variable:

- `NPM_GUARDIAN_DISABLE_GLOBAL=1`: skip adding npm global root to scan roots.

## Notes

- Only package identifiers (name/version/ecosystem) are sent to advisory providers; file paths and source contents remain local.
- Automated fix commands are generated for npm, maven, nuget, python, and go findings (not Gradle or VSCode extensions in v1).
- Scheduler examples for weekly automation are in [SCHEDULER_GUIDE.md](SCHEDULER_GUIDE.md).

## License

MIT
