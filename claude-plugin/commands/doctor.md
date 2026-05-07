---
description: Diagnose eco-guardian plugin runtime requirements and environment setup.
allowed-tools: Bash(node:*), Bash(npx:*)
argument-hint: ""
---

# Eco Guardian Doctor

Check whether the eco-guardian Claude Code plugin can run correctly in this environment.

## Step 1 — Environment

```bash
node --version; npm --version; pwd; rg --version; test -n "${NVD_API_KEY:-}" && echo "NVD_API_KEY: set" || echo "NVD_API_KEY: not set"; exit 0
```

## Step 2 — eco-guardian availability

```bash
npx -y github:boredom1234/eco-guardian --version; status=$?; echo "eco-guardian version check exit: $status"; exit 0
```

Summarize:

- whether Node, npm, and npx are available
- whether ripgrep (`rg`) is available (used for faster discovery)
- whether `NVD_API_KEY` is set (do not print the value)
- the installed eco-guardian version
- any setup action the user should take next
