---
description: Run eco-guardian as a policy gate and generate SARIF output.
allowed-tools: Bash(npx:*)
---

# Eco Guardian CI Gate

Run a policy-gated eco-guardian scan.

User arguments:

```text
$ARGUMENTS
```

If arguments are provided, pass them through:

```bash
set +e
npx -y github:boredom1234/eco-guardian $ARGUMENTS
status=$?
echo "eco-guardian exit code: $status"
```

If no arguments are provided, use this safe default:

```bash
set +e
npx -y github:boredom1234/eco-guardian --path . --ecosystems scan-all --fail-on-severity high --max-critical 0 --export-sarif eco-guardian.sarif --banner off
status=$?
echo "eco-guardian exit code: $status"
```

Summarize:

- whether the gate passed
- which threshold failed, if any
- whether SARIF was written
- which dependencies must be fixed before merge

Do not loosen thresholds unless the user explicitly asks.
