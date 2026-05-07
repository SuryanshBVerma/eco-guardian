---
description: Generate a safe remediation plan for eco-guardian findings.
allowed-tools: Bash(npx:*)
---

# Eco Guardian Fix Plan

Create a remediation plan from eco-guardian findings.

User arguments:

```text
$ARGUMENTS
```

Default behavior:

```bash
set +e
npx -y github:boredom1234/eco-guardian --path . --ecosystems scan-all --json --banner off
status=$?
echo "eco-guardian exit code: $status"
```

If the user provided arguments, include them instead of the defaults:

```bash
set +e
npx -y github:boredom1234/eco-guardian $ARGUMENTS
status=$?
echo "eco-guardian exit code: $status"
```

Produce a human-readable fix plan:

- group by severity
- identify direct vs transitive dependency issues when available
- prefer minimal safe upgrades
- call out manual-review ecosystems
- do not execute generated fix scripts

Only run `--fix` when the user explicitly asks for fix script generation. If a fix script is generated, inspect and explain it before suggesting execution.
