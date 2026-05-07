---
description: Scan the current project or a provided path for vulnerable dependencies with eco-guardian.
allowed-tools: Bash(npx:*)
---

# Eco Guardian Scan

Run eco-guardian against the current project unless the user provided explicit arguments.

User arguments:

```text
$ARGUMENTS
```

If arguments are provided, run:

```bash
set +e
npx -y github:boredom1234/eco-guardian $ARGUMENTS
status=$?
echo "eco-guardian exit code: $status"
```

If no arguments are provided, run:

```bash
set +e
npx -y github:boredom1234/eco-guardian --path . --ecosystems scan-all --banner off
status=$?
echo "eco-guardian exit code: $status"
```

After the command finishes, summarize the result for the user:

- Treat exit code 0 as no visible findings.
- Treat exit code 1 as findings found, not a tool failure.
- Treat exit code 2 as a runtime error.
- Treat exit code 3 as a policy gate failure.
- Highlight critical and high findings first.
- Mention affected ecosystem, package, installed version, fixed version, and remediation when available.
- Do not run `--fix` unless the user explicitly asks.
