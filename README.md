# eco-guardian

Unlike `npm audit` which only checks your current project, eco-guardian scans your entire machine for vulnerable packages across multiple ecosystems (`npm`, `Maven`, `NuGet`, `VSCode`, `Python`, and `Go`).

## Quick Start

Run instantly without installation:

```bash
npx github:boredom1234/eco-guardian
```

Or run locally:

```bash
node eco-guardian.js
```

## Flags

| Flag                      | Description                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `--path <dir>`            | Scan specific directory (default: home directory)                                                                         |
| `--ecosystems <list>`     | Comma-separated list of ecosystems to scan. Supported: `npm`, `maven`, `nuget`, `vscode`, `python`, `go` (default: `npm`) |
| `--global-only`           | Only scan global npm installs                                                                                             |
| `--severity <level>`      | Minimum severity: `low`, `moderate`, `high`, `critical`                                                                   |
| `--json`                  | Print findings JSON only to stdout                                                                                        |
| `--no-cache`              | Disable 1-hour local cache                                                                                                |
| `--fix`                   | Generate fix script in current directory (supports `npm`, `maven`, `nuget`, `python`, `go`)                               |
| `--export-txt <file>`     | Export findings report to TXT                                                                                             |
| `--export-html <file>`    | Export findings report to HTML (includes dependency breadcrumbs)                                                          |
| `--export-sarif <file>`   | Export findings report to SARIF 2.1.0 (GitHub compatible)                                                                 |
| `--baseline <file>`       | Apply baseline/ignore file (default: `.eco-guardian-baseline.json`)                                                       |
| `--write-baseline <file>` | Write current findings to a baseline file                                                                                 |
| `--why <package>`         | Explain why a package (or ecosystem) is present and how to fix it                                                         |
| `--benchmark`             | Show real-time RAM/CPU usage during scan                                                                                  |
| `--verbose`               | Show full advisory details for every finding on the console                                                               |
| `--graph-resolution`      | Advanced mode: resolve dependency graphs using native tools                                                               |
| `--help`                  | Show help                                                                                                                 |
| `--version`               | Show tool version                                                                                                         |
| `--global`                | On Unix, include `/` root scan                                                                                            |
| `--all-drives`            | Full machine scan mode                                                                                                    |

## Examples

```bash
node eco-guardian.js
node eco-guardian.js --path ~/projects --severity high
node eco-guardian.js --ecosystems npm,maven,nuget,vscode,python,go
node eco-guardian.js --global-only --json
node eco-guardian.js --fix
node eco-guardian.js --path "D:\\Projects\\my-app" --export-txt report.txt
node eco-guardian.js --graph-resolution --ecosystems maven,npm
node eco-guardian.js --baseline .eco-guardian-baseline.json
node eco-guardian.js --why lodash
node eco-guardian.js --export-sarif results.sarif
```

## Example Output

```text
=======================================================
eco-guardian scan complete
Packages scanned:  6,080 unique across selected ecosystems
Findings:          721 advisories found (12 CRITICAL, 37 HIGH, 661 MODERATE)
Vulnerable pkgs:   252
Clean packages:    5,828
Graph resolution:
  - npm: graph
  - maven: inventory-fallback (fallback: mvn not found)
Suppressed by baseline: 5
Peak RAM:          193.5 MB
Avg CPU:           195.1%
Scan Duration:     65.0s
=======================================================
```

## CI/CD Usage

`--json` is designed for pipelines.

```bash
node eco-guardian.js --json
echo $?   # 0 clean, 1 vulnerabilities found, 2 scan error
```

## Automation and Scheduling

For instructions on how to automate scans weekly using Windows Task Scheduler or cron (macOS/Linux), see the [Scheduler Guide](SCHEDULER_GUIDE.md).

## Graph Resolution Support

| Ecosystem  | Support Level | Native Tool Trigger        |
| ---------- | ------------- | -------------------------- |
| **npm**    | Supported     | `npm ls --all --json`      |
| **Maven**  | Supported     | `mvn dependency:tree`      |
| **NuGet**  | Supported     | `dotnet list package`      |
| **Go**     | Supported     | `go mod graph` + `go list` |
| **Python** | Partial       | `python -m pip inspect`    |
| **VSCode** | N/A           | -                          |

When `--graph-resolution` is enabled, eco-guardian attempts to use the native tool to resolve the full transitive graph. If resolution is unsupported, the native tool is missing, or the command fails, eco-guardian falls back to the standard inventory collector for that ecosystem and reports that fallback in the scan output.

## How It Works

1. Discover scan roots (target path, global npm path, optional full-disk roots).
2. Discover package sources depending on the target ecosystem.
   - npm: installed packages under discovered `node_modules`
   - Maven/NuGet: direct dependencies declared in supported manifests
   - Python: pinned dependencies from `requirements.txt`, `Pipfile.lock`, and `poetry.lock`
   - Go: dependencies declared in `go.mod` `require` entries
   - VSCode: installed extensions from the VSCode extensions directory or the explicit `--path`
3. Harvest unique packages and version pairs across the ecosystems.
4. Query OSV and npm advisories (only package identifiers leave your machine).
5. Build findings with local path/project mapping and remediation guidance.
   Automated fix scripts are generated for all supported ecosystems except VSCode extensions.

## Current parser scope

- Python `requirements.txt` scanning currently reads exact `name==version` pins.
- Go scanning currently reads `go.mod` `require` entries.
- Automated fix scripts support `npm`, `maven`, `nuget`, `python`, and `go`.

## Privacy

- Sent externally: package `name` and `version`.
- Never sent: file paths, source code, credentials, file contents.
- File paths stay local and are used only for local reporting.

## Development and Testing

Eco-guardian has a comprehensive test suite that validates parsers, resolvers, and reporting logic.

### Run Tests

```bash
npm test
```

This runs `test.js`, `test-resolvers.js`, and `test-coverage.js`.

### Coverage

We use `c8` to ensure high branch coverage across the scanner logic.

```bash
npm run coverage
```

To enforce coverage thresholds (65% lines/functions, 55% branches):

```bash
npm run coverage:check
```

## Exit Codes

- `0`: clean scan
- `1`: vulnerabilities found
- `2`: scan error (network/tooling/permissions preventing scan)

## License

MIT
