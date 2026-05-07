---
description: Run eco-guardian as a policy gate and generate SARIF output.
allowed-tools: Bash(npx:*)
argument-hint: [eco-guardian policy flags]
---

# Eco Guardian CI Gate

Run a policy-gated eco-guardian scan.

User arguments:

```text
$ARGUMENTS
```

Before running Bash, inspect `$ARGUMENTS`. If it contains shell control operators such as `;`, `&&`, `||`, `|`, backticks, `$(`, `<`, or `>`, do not run it. Ask the user to provide plain eco-guardian flags only.

If arguments are provided, pass them through:

```bash
npx -y github:boredom1234/eco-guardian $ARGUMENTS; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

If no arguments are provided, use this safe default:

```bash
npx -y github:boredom1234/eco-guardian --path . --ecosystems scan-all --fail-on-severity high --max-critical 0 --export-sarif eco-guardian.sarif --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

Summarize:

- whether the gate passed
- which threshold failed, if any
- whether SARIF was written
- which dependencies must be fixed before merge

Do not loosen thresholds unless the user explicitly asks.
