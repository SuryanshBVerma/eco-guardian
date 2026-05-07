---
name: dep-interceptor
description: >
  Check a package name against OSV before install. Fails open —
  never blocks the user's install. Spawned by PreToolUse hook.
allowed-tools: Bash(npx:*)
---

# Dependency Interceptor

Given a package name and ecosystem, check for known vulnerabilities
before the package is installed.

## Behavior

- Run: `npx -y github:boredom1234/eco-guardian --ecosystems <eco> --json --banner off --no-cache`
- If clean (exit 0): report package is clean
- If findings (exit 1): list advisories for this package
- On timeout (>15s): exit silently (fail open)
- On any error: exit silently (never block)
