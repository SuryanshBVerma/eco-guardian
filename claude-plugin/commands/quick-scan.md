---
description: Run a fast high-severity npm-focused eco-guardian scan.
allowed-tools: Bash(npx:*)
argument-hint: [eco-guardian flags]
---

# Eco Guardian Quick Scan

Fast scan optimized for common Node.js projects — npm only, high severity and above.

User arguments:

```text
$ARGUMENTS
```

Before running Bash, inspect `$ARGUMENTS`. If it contains shell control operators such as `;`, `&&`, `||`, `|`, backticks, `$(`, `<`, or `>`, do not run it. Ask the user to provide plain eco-guardian flags only.

If arguments are provided, run:

```bash
npx -y github:boredom1234/eco-guardian $ARGUMENTS; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

If no arguments are provided, run:

```bash
npx -y github:boredom1234/eco-guardian --ecosystems npm --severity high --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

Summarize high and critical findings first. Treat exit code 1 as findings found, not a plugin failure.
