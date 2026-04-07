# Contributing

## Add a New Vulnerability Data Source

`npm-guardian` is intentionally dependency-free and single-file. Keep new sources aligned with that model.

## Requirements

- Standard library only (`https`, `fs`, `path`, etc.).
- No external SDKs.
- Add 10s timeout and meaningful network errors.
- Normalize data into the existing advisory shape:
  - `id`, `aliases`, `severity`, `cvss_score`, `title`, `description`
  - `affected_versions`, `fixed_versions`, `references`

## Steps

1. Add a query function using built-in `https`.
2. Add a normalizer to map source-specific schema into common advisory format.
3. Merge advisories with de-duplication.
4. Respect `--severity` filtering.
5. Add test coverage in `test.js` for parsing and normalization edge cases.

## Test Locally

```bash
node test.js
node npm-guardian.js --path . --json --no-cache
```
