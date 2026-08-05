---
description: Create an eco-guardian baseline to suppress known findings. Review before committing.
allowed-tools: Bash(npx:*)
argument-hint: [eco-guardian baseline flags]
---

# Eco Guardian Baseline Create

Create a baseline from current findings. The baseline suppresses matching findings on future scans.

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
npx -y github:boredom1234/eco-guardian --ecosystems scan-all --write-baseline .eco-guardian-baseline.json --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

Afterward, explain:

- The baseline file was written to `.eco-guardian-baseline.json`
- It suppresses current findings in future scans
- Does not fix vulnerabilities — review before committing
- To review suppressed findings later, use `/eco-guardian:baseline-review`
