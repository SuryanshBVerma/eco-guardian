# npm-guardian

Unlike `npm audit` which only checks your current project, npm-guardian scans your entire machine for vulnerable packages across multiple ecosystems (`npm`, `Maven`, `NuGet`, `VSCode`, `Python`, and `Go`).

## Quick Start

```bash
node npm-guardian.js
```

No `npm install` required.

## Flags

| Flag | Description |
|---|---|
| `--path <dir>` | Scan specific directory (default: home directory) |
| `--ecosystems <list>` | Comma-separated list of ecosystems to scan. Supported: `npm`, `maven`, `nuget`, `vscode`, `python`, `go` (default: `npm`) |
| `--global-only` | Only scan global npm installs |
| `--severity <level>` | Minimum severity: `low`, `moderate`, `high`, `critical` |
| `--json` | Print findings JSON only to stdout |
| `--no-cache` | Disable 1-hour local cache |
| `--fix` | Generate fix script in current directory (npm only) |
| `--export-txt <file>` | Export findings report to TXT |
| `--export-html <file>` | Export findings report to HTML |
| `--help` | Show help |
| `--version` | Show tool version |
| `--global` | On Unix, include `/` root scan |
| `--all-drives` | Full machine scan mode |

## Examples

```bash
node npm-guardian.js
node npm-guardian.js --path ~/projects --severity high
node npm-guardian.js --ecosystems npm,maven,nuget,vscode,python,go
node npm-guardian.js --global-only --json
node npm-guardian.js --fix
node npm-guardian.js --path "D:\\Projects\\my-app" --export-txt report.txt
```

## Example Output

```text
=======================================================
npm-guardian scan complete
Packages scanned:  2,847 unique across selected ecosystems
Vulnerabilities:   3 found (1 CRITICAL, 1 HIGH, 1 MODERATE)
Clean packages:    2,844
=======================================================
```

## CI/CD Usage

`--json` is designed for pipelines.

```bash
node npm-guardian.js --json
echo $?   # 0 clean, 1 vulnerabilities found, 2 scan error
```

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
   Automated fix scripts are npm-only in the current version.

## Current parser scope

- Python `requirements.txt` scanning currently reads exact `name==version` pins.
- Go scanning currently reads `go.mod` `require` entries.
- Automated fix scripts are npm-only in the current version.

## Privacy

- Sent externally: package `name` and `version`.
- Never sent: file paths, source code, credentials, file contents.
- File paths stay local and are used only for local reporting.

## Exit Codes

- `0`: clean scan
- `1`: vulnerabilities found
- `2`: scan error (network/tooling/permissions preventing scan)
