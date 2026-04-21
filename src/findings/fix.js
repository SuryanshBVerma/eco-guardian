"use strict";

const fs = require("fs");
const { PLATFORM } = require("../config/constants");

function escapeShellArg(value, targetOS) {
  const text = String(value == null ? "" : value);
  if (targetOS === "win32") {
    return `'${text.replace(/'/g, "''")}'`;
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function detectProjectOS(projectPath) {
  if (
    !projectPath ||
    projectPath === "(unknown project)" ||
    projectPath === "(global)"
  ) {
    return PLATFORM;
  }
  try {
    const entries = fs.readdirSync(projectPath);
    const lowerEntries = entries.map((e) => e.toLowerCase());
    if (
      lowerEntries.some(
        (e) => e.endsWith(".bat") || e.endsWith(".cmd") || e.endsWith(".ps1"),
      )
    ) {
      return "win32";
    }
    if (lowerEntries.some((e) => e.endsWith(".sh"))) return "linux";
  } catch (_) {}
  return PLATFORM;
}

function pickBestFixedVersion(advisories) {
  for (const advisory of advisories) {
    if (
      Array.isArray(advisory.fixed_versions) &&
      advisory.fixed_versions.length > 0
    ) {
      for (const version of advisory.fixed_versions) {
        if (!version) continue;
        // Strip ranges like '>=', '<' and take the first part if it's a list
        const cleaned = version
          .replace(/^[<>=|\s]+/, "")
          .split(",")[0]
          .trim();
        // If it still looks like a range (contains symbols), skip it
        if (cleaned && !/[<>=|]/.test(cleaned)) return cleaned;
      }
    }
  }
  return null;
}

function buildFixCommand({
  ecosystem,
  packageName,
  fixedVersion,
  dependencyType,
  isGlobal,
  parentPackage,
}) {
  const eco = String(ecosystem || "").toLowerCase();
  const isWindows = PLATFORM === "win32";
  const quote = (value) => escapeShellArg(value, isWindows ? "win32" : "linux");

  if (eco === "npm") {
    if (isGlobal) {
      return fixedVersion
        ? `npm install -g ${quote(`${packageName}@${fixedVersion}`)}`
        : `npm uninstall -g ${quote(packageName)}`;
    }
    if (dependencyType === "direct") {
      return fixedVersion
        ? `npm install ${quote(`${packageName}@${fixedVersion}`)}`
        : `npm uninstall ${quote(packageName)}`;
    }
    if (dependencyType === "transitive") {
      return parentPackage && parentPackage.name
        ? `npm install ${quote(`${parentPackage.name}@latest`)}`
        : null;
    }
  }

  if (eco === "maven" || eco === "pypi" || eco === "python") {
    if (!fixedVersion) return null;
    if (eco === "maven") {
      return `mvn versions:use-dep-version -Dincludes=${quote(packageName.includes(":") ? packageName : "*:" + packageName)} -DdepVersion=${quote(fixedVersion)} -DforceVersion=true`;
    }
    return `pip install --upgrade ${quote(`${packageName}==${fixedVersion}`)}`;
  }

  if (eco === "nuget") {
    return fixedVersion
      ? `dotnet add package ${quote(packageName)} --version ${quote(fixedVersion)}`
      : null;
  }

  if (eco === "gradle") {
    return null;
  }

  if (eco === "go") {
    return fixedVersion
      ? `go get ${quote(`${packageName}@v${fixedVersion.replace(/^v/, "")}`)}`
      : null;
  }

  return null;
}

function buildScopedProjectCommand(project, command) {
  if (!project || project === "(unknown project)") return null;
  const targetOS = detectProjectOS(project);
  const escapedPsPath = String(project).replace(/'/g, "''");
  const escapedShPath = String(project).replace(/'/g, "'\\''");
  if (targetOS === "win32") {
    return `Set-Location -LiteralPath '${escapedPsPath}'; ${command}`;
  }
  return `cd '${escapedShPath}' && ${command}`;
}

function buildFixSteps({ ecosystem, foundIn, packageName, fixedVersion }) {
  const steps = [];
  const seen = new Set();

  for (const entry of foundIn || []) {
    const dependencyType =
      entry && entry.dependency_type ? entry.dependency_type : "transitive";
    const isGlobal = dependencyType === "global";
    const command = buildFixCommand({
      ecosystem,
      packageName,
      fixedVersion,
      dependencyType,
      isGlobal,
      parentPackage: entry ? entry.parent : null,
    });
    if (!command) continue;

    const project = isGlobal
      ? "(global)"
      : entry && entry.project
        ? entry.project
        : "(unknown project)";
    const dedupeKey = `${project}|${command}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    steps.push({ project, command });
  }

  return steps;
}

function fixStepsToDisplayCommands(steps) {
  const out = [];
  for (const step of steps || []) {
    if (step.project === "(global)") {
      out.push(step.command);
      continue;
    }
    const scoped = buildScopedProjectCommand(step.project, step.command);
    if (scoped) out.push(scoped);
  }
  return out;
}

module.exports = {
  detectProjectOS,
  pickBestFixedVersion,
  buildFixCommand,
  buildFixSteps,
  fixStepsToDisplayCommands,
};
