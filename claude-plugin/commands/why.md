---
description: Explain why a vulnerable package is present using eco-guardian --why.
allowed-tools: Bash(npx:*)
argument-hint: <package> [eco-guardian flags]
---

# Eco Guardian Why

Explain why a package appears in the dependency graph.

User arguments:

```text
$ARGUMENTS
```

Before running Bash, inspect `$ARGUMENTS`. If it contains shell control operators such as `;`, `&&`, `||`, `|`, backticks, `$(`, `<`, or `>`, do not run it. Ask the user to provide plain eco-guardian flags only.

If the user did not provide a package name, ask for one.

Otherwise run:

```bash
npx -y github:boredom1234/eco-guardian --path . --ecosystems scan-all --why $ARGUMENTS --banner off; status=$?; echo "eco-guardian exit code: $status"; exit 0
```

Summarize:

- where the package was found
- whether it appears direct or transitive
- parent package when available
- suggested remediation
- any fixed version shown by eco-guardian
