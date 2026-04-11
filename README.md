# npm-guardian

Unlike `npm audit` which only checks your current project, npm-guardian scans your entire machine for vulnerable packages across multiple ecosystems (`npm`, `Maven`, `NuGet`, and `VSCode`).

## Quick Start

```bash
node npm-guardian.js
```

No `npm install` required.

## Flags

| Flag | Description |
|---|---|
| `--path <dir>` | Scan specific directory (default: home directory) |
| `--ecosystems <list>` | Comma-separated list of ecosystems to scan. Supported: `npm`, `maven`, `nuget`, `vscode` (default: `npm`) |
| `--global-only` | Only scan global npm installs |
| `--severity <level>` | Minimum severity: `low`, `moderate`, `high`, `critical` |
| `--json` | Print findings JSON only to stdout |
| `--no-cache` | Disable 1-hour local cache |
| `--fix` | Generate fix script in current directory (npm only) |
| `--export-txt <file>` | Export findings report to TXT |
| `--help` | Show help |
| `--version` | Show tool version |
| `--global` | On Unix, include `/` root scan |
| `--all-drives` | Full machine scan mode |

## Examples

```bash
node npm-guardian.js
node npm-guardian.js --path ~/projects --severity high
node npm-guardian.js --ecosystems npm,maven,nuget,vscode
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
2. Discover package manifests depending on the target ecosystem (`node_modules`, `pom.xml`, `.csproj`, `packages.config`, `VSCode extensions`, etc).
3. Harvest unique packages and version pairs across the ecosystems.
4. Query OSV and npm advisories (only package identifiers leave your machine).
5. Build findings with local path/project mapping and actionable remediation hints or fix commands.

## Privacy

- Sent externally: package `name` and `version`.
- Never sent: file paths, source code, credentials, file contents.
- File paths stay local and are used only for local reporting.

## Exit Codes

- `0`: clean scan
- `1`: vulnerabilities found
- `2`: scan error (network/tooling/permissions preventing scan)
