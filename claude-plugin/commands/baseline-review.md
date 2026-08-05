---
description: Review eco-guardian findings with an existing baseline applied.
allowed-tools: Bash(npx:*)
argument-hint: [eco-guardian baseline flags]
---

# Eco Guardian Baseline Review

Review findings after applying an existing baseline. Does not modify the baseline file.

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
npx -y github:boredom1234/eco-guardian --ecosystems scan-all --baseline .eco-guardian-baseline.json --strict-baseline --json --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

Summarize:

- findings visible after baseline suppression
- whether critical or high issues remain
- whether the baseline has expired entries if visible in output
