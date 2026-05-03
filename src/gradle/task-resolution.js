"use strict";

const path = require("path");
const fsp = require("fs/promises");
const { createGraphPackage } = require("../resolve/shared");
const { runCommand } = require("../shared/command");
const { log } = require("../cli/output");
const { discoverGradleProjects } = require("./discover");
const {
  parseGradleDependenciesOutput,
} = require("./parse-dependencies-output");

const GRADLE_TASK_TIMEOUT_MS = 120000;

function normalizeGradleTask(task) {
  const value = String(task || "").trim();
  if (!value) return null;
  if (value === "dependencies" || value === ":dependencies") {
    return "dependencies";
  }
  if (value.endsWith(":dependencies")) {
    return value.startsWith(":") ? value : `:${value}`;
  }
  if (value.startsWith(":")) {
    return `${value}:dependencies`;
  }
  return `:${value}:dependencies`;
}

async function findGradleWrapperRoot(startDir) {
  let current = path.resolve(startDir || ".");

  while (true) {
    try {
      await fsp.access(path.join(current, "gradlew.bat"));
      return current;
    } catch (_) {}

    try {
      await fsp.access(path.join(current, "gradlew"));
      return current;
    } catch (_) {}

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function getGradleWrapperExecutable(root) {
  if (!root) return null;
  return process.platform === "win32"
    ? path.join(root, "gradlew.bat")
    : path.join(root, "gradlew");
}

function buildGradleCommand(root, task) {
  const executable = getGradleWrapperExecutable(root);
  if (!executable) return null;

  const gradleArgs = [task, "--console=plain", "--no-daemon"];

  if (process.platform === "win32") {
    return {
      file: "cmd",
      args: ["/d", "/s", "/c", executable, ...gradleArgs],
      invokedFile: executable,
    };
  }

  return {
    file: executable,
    args: gradleArgs,
    invokedFile: executable,
  };
}

function projectDirFromTask(wrapperRoot, task) {
  const normalized = normalizeGradleTask(task);
  if (!normalized) return path.resolve(wrapperRoot);

  if (normalized === "dependencies") {
    return path.resolve(wrapperRoot);
  }

  const stripped = normalized.replace(/^:/, "").replace(/:dependencies$/, "");
  if (!stripped) return path.resolve(wrapperRoot);

  return path.join(
    path.resolve(wrapperRoot),
    ...stripped.split(":").filter(Boolean),
  );
}

function buildAutoTask(wrapperRoot, projectDir) {
  const relative = path.relative(
    path.resolve(wrapperRoot),
    path.resolve(projectDir),
  );
  if (!relative || relative === ".") return "dependencies";
  const segments = relative.split(path.sep).filter(Boolean);
  return `:${segments.join(":")}:dependencies`;
}

function pickManifestPath(projectDir, foundFiles) {
  if (foundFiles && foundFiles.has("build.gradle.kts")) {
    return path.join(projectDir, "build.gradle.kts");
  }
  if (foundFiles && foundFiles.has("build.gradle")) {
    return path.join(projectDir, "build.gradle");
  }

  return path.join(projectDir, "build.gradle");
}

function mergePackageRecord(packageMap, record) {
  const existing = packageMap.get(record.key);
  if (!existing) {
    const pkg = createGraphPackage(
      "gradle",
      record.name,
      record.version,
      record.resolvedPath,
      record.depth,
    );
    pkg.paths.push(record.projectDir);
    pkg.occurrences.push({
      project: record.project,
      manifest_path: record.manifestPath,
      dependency_type: record.dependencyType,
      configuration: record.configuration,
    });
    packageMap.set(record.key, pkg);
    return;
  }

  if (!existing.paths.includes(record.projectDir)) {
    existing.paths.push(record.projectDir);
  }
  existing.occurrences.push({
    project: record.project,
    manifest_path: record.manifestPath,
    dependency_type: record.dependencyType,
    configuration: record.configuration,
  });

  if (
    typeof record.depth === "number" &&
    (typeof existing.depth !== "number" || record.depth < existing.depth)
  ) {
    existing.depth = record.depth;
    existing.resolved_path = record.resolvedPath;
  }
}

async function runDependenciesTask({
  projectDir,
  wrapperRoot,
  task,
  foundFiles,
  options,
  state,
}) {
  const command = buildGradleCommand(wrapperRoot, task);
  if (!command) return null;

  const commandRunner =
    (state && state.commandRunner) || options.commandRunner || runCommand;

  const result = await commandRunner(command.file, command.args, {
    cwd: wrapperRoot,
    timeoutMs: options.gradleTimeoutMs || GRADLE_TASK_TIMEOUT_MS,
  });

  const stdout =
    result && typeof result.stdout === "string" ? result.stdout : "";
  if (!stdout.trim()) return null;

  const manifestPath = pickManifestPath(projectDir, foundFiles);
  const records = parseGradleDependenciesOutput(stdout, {
    projectDir,
    projectName: path.basename(projectDir),
    manifestPath,
  });

  if (records.length === 0) {
    return null;
  }

  if (options.verbose) {
    log(
      "info",
      `Parsed ${records.length} Gradle dependency nodes from ${task} (${path.basename(projectDir)})`,
      options,
    );
  }

  return {
    records,
    ok: !!(result && result.ok),
    task,
    wrapperRoot,
    command: command.invokedFile,
  };
}

async function resolveGradleTaskPackages(roots, options, state) {
  const packageMap = new Map();
  const rootsArray = Array.isArray(roots) ? roots : [roots];
  const projectMap = await discoverGradleProjects(rootsArray);
  const explicitTask = options.gradleTask
    ? normalizeGradleTask(options.gradleTask)
    : null;

  if (projectMap.size === 0 && !explicitTask) {
    return {
      packageMap,
      mode: "n/a",
      reason: "no Gradle projects found",
      usedFallback: true,
    };
  }

  if (explicitTask) {
    const wrapperRoot = await findGradleWrapperRoot(
      rootsArray[0] || process.cwd(),
    );
    if (!wrapperRoot) {
      return {
        packageMap,
        mode: "n/a",
        reason: "Gradle wrapper not found",
        usedFallback: true,
      };
    }

    const projectDir = projectDirFromTask(wrapperRoot, explicitTask);
    const foundFiles = projectMap.get(projectDir) || new Set();
    const resolved = await runDependenciesTask({
      projectDir,
      wrapperRoot,
      task: explicitTask,
      foundFiles,
      options,
      state,
    });

    if (resolved) {
      for (const record of resolved.records) {
        mergePackageRecord(packageMap, record);
      }
    }

    return {
      packageMap,
      mode: packageMap.size > 0 ? "task" : "n/a",
      reason:
        packageMap.size > 0
          ? "Gradle dependencies task"
          : "no resolved packages from task output",
      usedFallback: packageMap.size === 0,
    };
  }

  for (const [projectDir, foundFiles] of projectMap.entries()) {
    const wrapperRoot = await findGradleWrapperRoot(projectDir);
    if (!wrapperRoot) continue;

    const task = buildAutoTask(wrapperRoot, projectDir);
    const resolved = await runDependenciesTask({
      projectDir,
      wrapperRoot,
      task,
      foundFiles,
      options,
      state,
    });

    if (!resolved) continue;

    for (const record of resolved.records) {
      mergePackageRecord(packageMap, record);
    }
  }

  return {
    packageMap,
    mode: packageMap.size > 0 ? "task" : "n/a",
    reason:
      packageMap.size > 0
        ? "Gradle dependencies task"
        : "no resolved packages from task output",
    usedFallback: packageMap.size === 0,
  };
}

module.exports = {
  resolveGradleTaskPackages,
  normalizeGradleTask,
  findGradleWrapperRoot,
};
