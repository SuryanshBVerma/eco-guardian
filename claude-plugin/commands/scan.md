---
description: Scan the current project or a provided path for vulnerable dependencies with eco-guardian.
allowed-tools: Bash(npx:*)
argument-hint: [eco-guardian flags]
---

# Eco Guardian Scan

Run eco-guardian against the current project unless the user provided explicit arguments.

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
npx -y github:boredom1234/eco-guardian --ecosystems scan-all --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

After the command finishes, summarize the result for the user:

- Treat exit code 0 as no visible findings.
- Treat exit code 1 as findings found, not a tool failure.
- Treat exit code 2 as a runtime error.
- Treat exit code 3 as a policy gate failure.
- Highlight critical and high findings first.
- Mention affected ecosystem, package, installed version, fixed version, and remediation when available.
- Do not run `--fix` unless the user explicitly asks.
