# eco-guardian

eco-guardian is a Node.js CLI vulnerability scanner for local dependency inventories across:

- npm
- Maven
- Gradle
- NuGet
- VSCode extensions
- Python
- Go

It discovers dependency manifests locally, queries OSV (plus npm advisory cross-checks for npm packages), and can optionally enrich Java findings with NVD data in dependency-check mode.

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
node eco-guardian.js [flags]
```

Examples:

```bash
node eco-guardian.js --path ./my-project --severity high
node eco-guardian.js --ecosystems npm,maven,gradle,nuget,vscode,python,go
node eco-guardian.js --graph-resolution --ecosystems npm,maven,gradle
node eco-guardian.js --dependency-check-mode --ecosystems maven,gradle
node eco-guardian.js --export-html report.html --export-sarif report.sarif
node eco-guardian.js --baseline .eco-guardian-baseline.json --strict-baseline
node eco-guardian.js --watch --notify-on-severity high
```

## Flags

| Flag                           | Description                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `--path <dir>`                 | Scan a specific directory.                                                        |
| `--global-only`                | Scan only global npm installs.                                                    |
| `--ecosystems <list>`          | Comma-separated list: `npm,maven,gradle,nuget,vscode,python,go` (default: `npm`). |
| `--graph-resolution`           | Resolve dependency graphs with ecosystem-native resolvers.                        |
| `--dependency-check-mode`      | Java-only NVD enrichment for Maven/Gradle findings.                               |
| `--nvd-api-key <key>`          | NVD API key for higher NVD rate limits.                                           |
| `--severity <level>`           | Minimum severity: `low`, `moderate`, `high`, `critical`.                          |
| `--json`                       | Print findings JSON to stdout.                                                    |
| `--banner <on\|off>`           | Toggle CLI chrome/progress output.                                                |
| `--no-cache`                   | Disable local cache reads/writes.                                                 |
| `--fix`                        | Generate fix scripts for npm, maven, nuget, python, go.                           |
| `--export-txt <file>`          | Export TXT report.                                                                |
| `--export-html <file>`         | Export HTML report.                                                               |
| `--export-sarif <file>`        | Export SARIF 2.1.0 report.                                                        |
| `--export-json <file>`         | Export JSON report.                                                               |
| `--export-csv <file>`          | Export CSV report.                                                                |
| `--baseline <file>`            | Apply baseline suppression file.                                                  |
| `--write-baseline <file>`      | Write current findings as a baseline.                                             |
| `--strict-baseline`            | Fail when explicit baseline file is missing/invalid.                              |
| `--fail-on-severity <level>`   | Policy gate: fail if any finding is at or above level.                            |
| `--max-critical <n>`           | Policy gate: fail if critical findings exceed `n`.                                |
| `--max-high <n>`               | Policy gate: fail if high findings exceed `n`.                                    |
| `--why <package>`              | Show focused dependency path/remediation output.                                  |
| `--benchmark`                  | Show peak RAM, average CPU, duration.                                             |
| `--watch`                      | Run incremental watch mode.                                                       |
| `--notify-on-severity <level>` | Watch alert threshold (default: `high`).                                          |
| `--state-file <file>`          | Persistent watch state snapshot file.                                             |
| `--alerts-file <file>`         | JSONL alert ledger file.                                                          |
| `--alerts-md <file>`           | Markdown alert digest output.                                                     |
| `--reconcile-interval <sec>`   | Watch reconciliation interval (default: `900`).                                   |
| `--watch-debounce-ms <ms>`     | Debounce before rescanning dirty projects (default: `1500`).                      |
| `--verbose`                    | Print detailed finding output and phase timings.                                  |
| `--global`                     | On Unix-like systems, include `/` root scan.                                      |
| `--all-drives`                 | Alias for full-disk opt-in behavior.                                              |
| `--help`                       | Show help.                                                                        |
| `--version`                    | Show version.                                                                     |

## Behavior Notes

- Discovery preference order is: ripgrep (`rg`) -> native OS tools -> recursive filesystem walk.
- Default scan roots:
  - `--path` if provided
  - `--global-only` scans only npm global root
  - otherwise: Windows drive roots, or Unix home directory (plus `/` when `--global`/`--all-drives` is set)
  - npm global root is also added unless disabled by env var (below)
- Graph resolution support matrix:

| Ecosystem | Support        |
| --------- | -------------- |
| npm       | supported      |
| maven     | supported      |
| gradle    | supported      |
| nuget     | supported      |
| go        | supported      |
| python    | partial        |
| vscode    | not applicable |

- If graph resolution returns no data for an ecosystem, scanning falls back to inventory collection for that ecosystem.
- `--dependency-check-mode` applies only to Java ecosystems (`maven`, `gradle`).
- Automated fix command generation does not currently cover Gradle or VSCode extension findings.

## Watch Mode

`--watch` runs a bootstrap scan, indexes dependency inputs, and rescans only dirty projects/ecosystems on change.

- Alerts are written to JSONL (`--alerts-file`) and optionally Markdown (`--alerts-md`).
- Watch state is persisted to `--state-file` and reloaded for resume behavior.
- A periodic reconcile pass mitigates missed filesystem events.

## Scripts

```bash
npm start
npm test
npm run coverage
npm run coverage:check
```

Current `npm test` pipeline:

- `node test.js`
- `node test-resolvers.js`
- `node test-gradle.js`
- `node test-gradle-static.js`
- `node test-coverage.js`
- `node test-watch.js`

`test-ripgrep.js` exists in the repository but is not included in the default `npm test` script.

## Configuration

Environment variables:

- `NPM_GUARDIAN_DISABLE_GLOBAL=1`: do not add npm global root to scan roots.

## Exit Codes

- `0`: no visible findings
- `1`: findings present
- `2`: scan/runtime error
- `3`: policy gate failed

## Notes

- Only package identifiers (name/version/ecosystem) are sent to advisory providers.
- Scheduler examples are in [SCHEDULER_GUIDE.md](SCHEDULER_GUIDE.md).
- Contributor guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
