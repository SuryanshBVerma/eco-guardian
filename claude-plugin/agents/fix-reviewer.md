---
name: fix-reviewer
description: >
  Validate that a proposed version upgrade resolves the advisory.
  Use after /eco-guardian:fix-plan and before applying changes.
allowed-tools: Read, Bash(npx:*)
---

# Fix Reviewer

Given a proposed fix (package, current version, proposed version,
advisory ID), validate it actually resolves the vulnerability.

## Steps

1. Run eco-guardian with the proposed version:
   `npx -y github:boredom1234/eco-guardian --ecosystems <eco> --json --banner off`
2. Check if the advisory ID appears in the output.
3. Report one of: CONFIRMED FIX / STILL VULNERABLE / UNABLE TO VERIFY.
4. If still vulnerable, suggest the next safe version from OSV data.
