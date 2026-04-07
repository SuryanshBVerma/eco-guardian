# npm-guardian

Zero-dependency Node.js CLI that scans your machine for vulnerable npm packages.

## Quick Start

```bash
curl -o npm-guardian.js https://raw.githubusercontent.com/<your-org>/<your-repo>/main/npm-guardian.js
node npm-guardian.js
```

No `npm install` required.

## Flags

| Flag | Description |
|---|---|
| `--path <dir>` | Scan specific directory (default: home directory) |
| `--global-only` | Only scan global npm installs |
| `--severity <level>` | Minimum severity: `low`, `moderate`, `high`, `critical` |
| `--json` | Print findings JSON only to stdout |
| `--no-cache` | Disable 1-hour local cache |
| `--fix` | Generate fix script in current directory |
| `--export-txt <file>` | Export findings report to TXT |
| `--export <file>` | Alias of `--export-txt` |
| `--help` | Show help |
| `--version` | Show tool version |
| `--global` | On Unix, include `/` root scan |
| `--all-drives` | Full machine scan mode |

## Examples

```bash
node npm-guardian.js
node npm-guardian.js --path ~/projects --severity high
node npm-guardian.js --global-only --json
node npm-guardian.js --fix
node npm-guardian.js --path "D:\\Projects\\my-app" --export-txt report.txt
```

## Example Output

```text
=======================================================
npm-guardian scan complete
Packages scanned:  2,847 unique
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
2. Discover `node_modules` directories with OS-native search and fallback walker.
3. Harvest unique `name@version` pairs.
4. Query OSV and npm advisories (only package name/version leaves machine).
5. Build findings with local path/project mapping and fix commands.

## Privacy

- Sent externally: package `name` and `version`.
- Never sent: file paths, source code, credentials, file contents.
- File paths stay local and are used only for local reporting.

## Exit Codes

- `0`: clean scan
- `1`: vulnerabilities found
- `2`: scan error (network/tooling/permissions preventing scan)
