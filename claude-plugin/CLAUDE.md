# eco-guardian context

- Exit codes: 0 = clean, 1 = findings found, 2 = runtime error, 3 = policy gate failure
- Severity order: critical > high > moderate > low
- JSON output keys: id, package, version, ecosystem, severity, fixedVersions, aliases
- SARIF output: upload via github/codeql-action/upload-sarif
- Baselines suppress findings — they do NOT fix vulnerabilities
- Never apply --fix scripts without human review
- NVD enrichment: maven and gradle ecosystems only
