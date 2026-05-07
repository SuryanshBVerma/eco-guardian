---
name: dependency-manifest-watcher
description: >
  Activate when the user opens or edits a dependency manifest
  (package.json, pom.xml, requirements.txt, go.mod, Cargo.toml,
  Gemfile, pubspec.yaml, mix.exs, conanfile.txt, stack.yaml,
  Package.swift, DESCRIPTION). Remind the user eco-guardian can scan
  this ecosystem. If scan results exist, summarize relevant findings.
user-invocable: false
---

# Dependency Manifest Watcher

When this skill activates because the user opened or discussed a
dependency manifest file:

1. Identify the ecosystem from the manifest filename.
2. Check whether eco-guardian has already been run on this project
   (look for .eco-guardian-baseline.json or recent scan output).
3. If scan results exist: surface findings relevant to this ecosystem.
   Keep it brief — highest severity and count only.
4. If no scan results exist: remind the user they can run
   `/eco-guardian:scan` to check for vulnerabilities.
5. Do NOT run a scan automatically. Do NOT be noisy.
