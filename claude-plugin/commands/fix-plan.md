---
description: Generate a safe remediation plan for eco-guardian findings.
allowed-tools: Bash(npx:*)
argument-hint: [eco-guardian flags]
---

# Eco Guardian Fix Plan

Create a remediation plan from eco-guardian findings.

User arguments:

```text
$ARGUMENTS
```

Before running Bash, inspect `$ARGUMENTS`. If it contains shell control operators such as `;`, `&&`, `||`, `|`, backticks, `$(`, `<`, or `>`, do not run it. Ask the user to provide plain eco-guardian flags only.

Default behavior:

```bash
npx -y github:boredom1234/eco-guardian --ecosystems scan-all --json --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

If the user provided arguments, include them instead of the defaults:

```bash
npx -y github:boredom1234/eco-guardian $ARGUMENTS; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

Produce a human-readable fix plan:

- group by severity
- identify direct vs transitive dependency issues when available
- prefer minimal safe upgrades
- call out manual-review ecosystems
- do not execute generated fix scripts

Only run `--fix` when the user explicitly asks for fix script generation. If a fix script is generated, inspect and explain it before suggesting execution.
