# eco-guardian

![CI](https://github.com/boredom1234/eco-guardian/actions/workflows/ci.yml/badge.svg)

eco-guardian is a Node.js CLI vulnerability scanner for local dependency inventories across 16 ecosystems:

- npm, Maven, Gradle, NuGet, VSCode extensions, Python, Go
- Ruby, Rust, PHP, Dart, Elixir, C/C++ (Conan), Haskell, Swift, R

It discovers dependency manifests locally, queries OSV (plus npm advisory cross-checks for npm packages), and enriches Java findings with NVD data using parallel CPE queries with pagination and keyword-search version verification.

## Setup

### Run without cloning

```bash
npx github:boredom1234/eco-guardian
```

You can also invoke it directly if you have the package available via `npx`:

```bash
npx eco-guardian
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
node eco-guardian.js --ecosystems scan-all
node eco-guardian.js --ecosystems npm,maven,gradle,nuget,vscode,python,go,ruby,rust,php,dart,elixir,conan,haskell,swift,r
node eco-guardian.js --graph-resolution --ecosystems npm,maven,gradle
node eco-guardian.js --ecosystems gradle --graph-resolution --gradle-task :application:dependencies --path ./service
node eco-guardian.js --nvd-mode on --ecosystems maven,gradle
node eco-guardian.js --nvd-mode on --ecosystems maven --nvd-api-key xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Or via environment variable:
set NVD_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx && node eco-guardian.js --ecosystems maven,gradle --graph-resolution
node eco-guardian.js --no-nvd --ecosystems gradle
node eco-guardian.js --export-html report.html --export-sarif report.sarif
node eco-guardian.js --baseline .eco-guardian-baseline.json --strict-baseline
node eco-guardian.js --watch --notify-on-severity high
node eco-guardian.js --ui
```

## Flags

| Flag                            | Description                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `--path <dir>`                  | Scan a specific directory.                                                              |
| `--global-only`                 | Scan only global npm installs.                                                          |
| `--ecosystems <list\|scan-all>` | Comma-separated list or `scan-all` for all 16 ecosystems (default: `npm`).              |
| `--graph-resolution`            | Resolve dependency graphs with ecosystem-native resolvers.                              |
| `--ui`                          | Launch a local browser UI for generating CLI commands.                                  |
| `--gradle-task <task>`          | Gradle dependencies task to execute for graph resolution (e.g. `:app:dependencies`).    |
| `--dependency-check-mode`       | Compatibility alias for `--nvd-mode on`.                                                |
| `--nvd-mode <auto\|on\|off>`    | NVD enrichment mode for Java ecosystems (`maven`, `gradle`). Default: `auto`.           |
| `--no-nvd`                      | Disable NVD enrichment.                                                                 |
| `--nvd-api-key <key>`           | NVD API key for higher rate limits (also reads `NVD_API_KEY` env).                      |
| `--severity <level>`            | Minimum severity: `low`, `moderate`, `high`, `critical`.                                |
| `--json`                        | Print findings JSON to stdout.                                                          |
| `--banner <on\|off>`            | Toggle CLI chrome/progress output.                                                      |
| `--no-cache`                    | Disable local cache reads/writes.                                                       |
| `--fix`                         | Generate fix scripts (npm, maven, nuget, python, go, ruby, rust, php, dart, elixir, r). |
| `--export-txt <file>`           | Export TXT report.                                                                      |
| `--export-html <file>`          | Export HTML report.                                                                     |
| `--export-sarif <file>`         | Export SARIF 2.1.0 report.                                                              |
| `--export-json <file>`          | Export JSON report.                                                                     |
| `--export-csv <file>`           | Export CSV report.                                                                      |
| `--baseline <file>`             | Apply baseline suppression file.                                                        |
| `--write-baseline <file>`       | Write current findings as a baseline.                                                   |
| `--strict-baseline`             | Fail when explicit baseline file is missing/invalid.                                    |
| `--fail-on-severity <level>`    | Policy gate: fail if any finding is at or above level.                                  |
| `--max-critical <n>`            | Policy gate: fail if critical findings exceed `n`.                                      |
| `--max-high <n>`                | Policy gate: fail if high findings exceed `n`.                                          |
| `--why <package>`               | Show focused dependency path/remediation output.                                        |
| `--benchmark`                   | Show peak RAM, average CPU, duration.                                                   |
| `--watch`                       | Run incremental watch mode.                                                             |
| `--notify-on-severity <level>`  | Watch alert threshold (default: `high`).                                                |
| `--state-file <file>`           | Persistent watch state snapshot file.                                                   |
| `--alerts-file <file>`          | JSONL alert ledger file.                                                                |
| `--alerts-md <file>`            | Markdown alert digest output.                                                           |
| `--reconcile-interval <sec>`    | Watch reconciliation interval (default: `900`).                                         |
| `--watch-debounce-ms <ms>`      | Debounce before rescanning dirty projects (default: `1500`).                            |
| `--verbose`                     | Print detailed finding output and phase timings.                                        |
| `--global`                      | On Unix-like systems, include `/` root scan.                                            |
| `--all-drives`                  | Alias for full-disk opt-in behavior.                                                    |
| `--help`                        | Show help.                                                                              |
| `--version`                     | Show version.                                                                           |

## Behavior Notes

- Discovery preference order is: ripgrep (`rg`) -> native OS tools -> recursive filesystem walk.
- On Windows, drives are discovered via PowerShell `Get-CimInstance`, with `wmic` and A–Z letter fallbacks.
- `--ecosystems scan-all` expands to all 16 supported ecosystems.
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
| ruby      | supported      |
| rust      | supported      |
| php       | supported      |
| dart      | supported      |
| python    | partial        |
| elixir    | partial        |
| conan     | partial        |
| haskell   | partial        |
| swift     | partial        |
| r         | partial        |
| vscode    | not applicable |

- If graph resolution returns no data for an ecosystem, scanning falls back to inventory collection for that ecosystem.
- For Gradle graph resolution, `--gradle-task` can scope analysis to a specific module task output.
- In `auto` NVD mode (default), Java ecosystems (`maven`, `gradle`) are enriched with NVD in addition to OSV.
- NVD queries run in parallel (2 concurrent workers) with API pagination (up to 100 results per artifact) and throttle to stay within NVD rate limits.
- NVD keyword-search fallback results are filtered against the package version to reduce false positives.
- `--dependency-check-mode` is retained as a compatibility alias for `--nvd-mode on`.
- Maven POM parsing resolves `project.*` built-in properties (`${project.version}`, `${project.groupId}`, `${project.artifactId}`) and `${parent.version}` from the parent POM reference.
- XML comments and CDATA sections in POM files are safely stripped before parsing.
- Automated fix command generation does not cover Gradle, VSCode, Conan, Haskell, or Swift findings (these ecosystems have no single-package upgrade CLI or use manual pinning).

## Ecosystem maturity

| Level        | Ecosystems                               | Notes                                     |
| ------------ | ---------------------------------------- | ----------------------------------------- |
| Stable       | npm, Maven, Gradle, NuGet                | Best-covered scanner paths and tests      |
| Beta         | Python, Go, Ruby, Rust, PHP, Dart        | Useful coverage, still expanding fixtures |
| Experimental | VSCode, Elixir, Conan, Haskell, Swift, R | Best-effort manifest/lock parsing         |

## Accuracy and limitations

- Graph resolution is preferred when available.
- Inventory scans may miss transitive context.
- NVD enrichment is heuristic for Java ecosystems (CPE + keyword filtering).
- SARIF locations are best-effort when line numbers are not available.
- Fix commands are recommendations; review before applying.

## UI (Command Builder)

`--ui` starts a local HTTP server that serves a browser-based command builder. No scan is run — it is purely for interactively constructing CLI commands.

```
src/ui/
  manifest.js          Declarative schema of all CLI flags (sections: Target, Analysis,
                       Output, Policy, Watch, Advanced)
  command-builder.js   Engine: buildCommand(), normalizeState(), validateState(), shellQuote()
  server.js            HTTP server serving static assets + two JSON APIs
  public/              Thin SPA served by the server (fetches manifest via /api/bootstrap)
    index.html          Shell with hero + generated command
    app.js             Fetches manifest from server, renders fields, calls /api/command
    styles.css         Dark-themed styling
    favicon.png        Icon
  standalone/          Fully self-contained offline SPA (inlined manifest + command-builder)
    index.html          Shell with hero + generated command
    app.js             Inlined constants, manifest, and command-builder for offline use
    styles.css         Dark-themed styling
    favicon.png        Icon
```

**Server endpoints:**

| Method | Path             | Purpose                                                        |
| ------ | ---------------- | -------------------------------------------------------------- |
| GET    | `/`              | Serves `index.html`                                            |
| GET    | `/app.js`        | Serves the standalone SPA                                      |
| GET    | `/styles.css`    | Serves styles                                                  |
| GET    | `/favicon.png`   | Serves favicon                                                 |
| GET    | `/api/bootstrap` | Returns the UI manifest, initial state, and a prebuilt command |
| POST   | `/api/command`   | Accepts JSON state, validates it, returns the built command    |

The browser SPA (`public/app.js`) fetches `/api/bootstrap` on load, renders all form fields dynamically from the manifest, and sends state to `/api/command` on every field change to rebuild the command live. The same `UI_MANIFEST` and `buildCommand()` run on both the server and the client.

The `standalone/` directory contains an offline copy of the SPA that inlines the manifest and command-builder directly — no server required. It generates commands using `npx github:boredom1234/eco-guardian` as the prefix.

The server binds to `127.0.0.1` on a random port and prints the URL to stdout.

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
npm run pack:check
```

Current `npm test` pipeline:

- `node test.js`
- `node test-ui.js`
- `node test-resolvers.js`
- `node test-gradle.js`
- `node test-gradle-static.js`
- `node test-fixtures.js`
- `node test-coverage.js`
- `node test-watch.js`

`test-ripgrep.js` exists in the repository but is not included in the default `npm test` script.

## Configuration

Environment variables:

- `NPM_GUARDIAN_DISABLE_GLOBAL=1`: do not add npm global root to scan roots.
- `NVD_API_KEY`: NVD API key for higher rate limits (alternative to `--nvd-api-key`).

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
