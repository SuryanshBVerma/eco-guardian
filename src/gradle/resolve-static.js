"use strict";

const fsp = require("fs/promises");
const path = require("path");
const { parseGradleBuild } = require("./parse-build");
const { parseGradleLockfile } = require("./parse-lockfile");
const { parseGradleSettings } = require("./parse-settings");
const { parseVersionCatalog } = require("./parse-version-catalog");
const {
  fetchMetadata,
  parsePomDependencies,
  parseModuleDependencies,
  isResolvableVersion,
} = require("./fetch-metadata");
const { createGraphPackage } = require("../resolve/shared");
const { asyncPool } = require("../shared/async");
const { API_CONCURRENCY } = require("../config/constants");
const { log } = require("../cli/output");
const { resolveGradleTaskPackages } = require("./task-resolution");

/**
 * Main orchestrator for static Gradle resolution.
 */
async function resolveGradleStatic(roots, options, state) {
  const taskResolved = await resolveGradleTaskPackages(roots, options, state);
  if (taskResolved.packageMap.size > 0) {
    return {
      packageMap: taskResolved.packageMap,
      mode: taskResolved.mode,
      reason: taskResolved.reason,
      usedFallback: false,
    };
  }

  const { discoverGradleProjects } = require("./discover");
  const packageMap = new Map();
  const rootsArray = Array.isArray(roots) ? roots : [roots];

  const projectMap = await discoverGradleProjects(rootsArray);
  const projectDirs = Array.from(projectMap.keys());

  let mode = "metadata";
  const reason = "static resolution";

  if (projectDirs.length === 0) {
    return {
      packageMap,
      mode: "n/a",
      reason: "no projects found",
      usedFallback: true,
    };
  }

  for (const projectDir of projectDirs) {
    const context = await buildProjectContext(projectDir);

    if (context.hasLockfile && context.lockfiles.length > 0) {
      mode = "lockfile";
      await resolveFromLockfiles(context, packageMap, projectDir, options);
    } else {
      await resolveFromMetadata(context, packageMap, projectDir, options);
    }
  }

  return {
    packageMap,
    mode,
    reason,
    usedFallback: packageMap.size === 0,
  };
}

async function buildProjectContext(root) {
  const context = {
    root,
    subprojects: [],
    catalog: null,
    buildFiles: [],
    lockfiles: [],
    hasLockfile: false,
  };

  const files = await fsp.readdir(root);

  if (
    files.includes("settings.gradle") ||
    files.includes("settings.gradle.kts")
  ) {
    const settingsFile = files.includes("settings.gradle")
      ? "settings.gradle"
      : "settings.gradle.kts";
    const content = await fsp.readFile(path.join(root, settingsFile), "utf8");
    const settings = parseGradleSettings(
      content,
      path.join(root, settingsFile),
    );
    context.subprojects = settings.subprojects;
  }

  if (files.includes("libs.versions.toml")) {
    const content = await fsp.readFile(
      path.join(root, "libs.versions.toml"),
      "utf8",
    );
    context.catalog = parseVersionCatalog(content);
  }

  for (const f of files) {
    if (f === "build.gradle" || f === "build.gradle.kts")
      context.buildFiles.push(f);
    if (f.endsWith(".lockfile")) {
      context.lockfiles.push(f);
      context.hasLockfile = true;
    }
  }

  return context;
}

async function resolveFromLockfiles(context, packageMap, root, options) {
  for (const lockfileName of context.lockfiles) {
    const content = await fsp.readFile(path.join(root, lockfileName), "utf8");
    const locked = parseGradleLockfile(content, path.join(root, lockfileName));

    for (const record of locked) {
      const name = `${record.group}:${record.name}`;
      const pkg = createGraphPackage(
        "gradle",
        name,
        record.version,
        [name + "@" + record.version],
        1,
      );
      pkg.paths.push(root);
      pkg.occurrences.push({
        project: path.basename(root),
        manifest_path: path.join(root, lockfileName),
        dependency_type: "direct", // Locked are treated as pinned/direct in inventory
      });
      packageMap.set(pkg.key, pkg);
    }
  }
}

async function resolveFromMetadata(context, packageMap, root, options) {
  const directDeps = [];
  const stats = {
    skippedInvalid: 0,
    fetch404: 0,
    fetchErrors: 0,
    warned: 0,
  };

  for (const buildFile of context.buildFiles) {
    const content = await fsp.readFile(path.join(root, buildFile), "utf8");
    const parsed = parseGradleBuild(content, path.join(root, buildFile));

    for (const dep of parsed) {
      if (dep.alias && context.catalog) {
        const resolved = context.catalog.libraries[dep.alias];
        if (resolved) {
          dep.group = resolved.group;
          dep.name = resolved.name;
          dep.version = resolved.version;
        }
      }
      if (dep.group && dep.name && dep.version) {
        directDeps.push(dep);
      }
    }
  }

  const visited = new Set();
  const MAX_VERBOSE_WARNINGS = 20;

  async function walk(dep, currentPath, depth) {
    if (!dep.group || !dep.name || !isResolvableVersion(dep.version)) {
      stats.skippedInvalid += 1;
      return;
    }

    const key = `${dep.group}:${dep.name}:${dep.version}`;
    if (visited.has(key) || depth > 10) return;
    visited.add(key);

    const name = `${dep.group}:${dep.name}`;
    const pkgKey = `gradle|${name}|${dep.version}`;

    if (!packageMap.has(pkgKey)) {
      const pkg = createGraphPackage(
        "gradle",
        name,
        dep.version,
        currentPath,
        depth,
      );
      pkg.paths.push(root);
      pkg.occurrences.push({
        project: path.basename(root),
        manifest_path: path.join(root, dep.source || "build.gradle"),
        dependency_type: depth === 1 ? "direct" : "transitive",
      });
      packageMap.set(pkgKey, pkg);

      if (options.graphResolution) {
        try {
          const metadata = await fetchMetadata(
            dep.group,
            dep.name,
            dep.version,
          );
          let transitive = [];
          if (metadata.trim().startsWith("{")) {
            transitive = parseModuleDependencies(metadata);
          } else {
            transitive = parsePomDependencies(metadata);
          }

          await asyncPool(API_CONCURRENCY, transitive, async (tDep) => {
            const nextPath = [
              ...currentPath,
              `${tDep.group}:${tDep.name}@${tDep.version}`,
            ];
            await walk(tDep, nextPath, depth + 1);
          });
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          if (message.includes("HTTP 404")) {
            stats.fetch404 += 1;
          } else {
            stats.fetchErrors += 1;
          }

          if (options.verbose && stats.warned < MAX_VERBOSE_WARNINGS) {
            stats.warned += 1;
            log(
              "warn",
              `Transitive metadata unavailable for ${key}: ${message}`,
              options,
            );
          }
        }
      }
    }
  }

  await asyncPool(API_CONCURRENCY, directDeps, async (dep) => {
    await walk(dep, [`${dep.group}:${dep.name}@${dep.version}`], 1);
  });

  if (options.verbose && options.graphResolution) {
    log(
      "info",
      `Gradle metadata resolution summary (${path.basename(root)}): skipped-invalid=${stats.skippedInvalid}, not-found=${stats.fetch404}, errors=${stats.fetchErrors}, warnings-shown=${stats.warned}`,
      options,
    );
  }
}

module.exports = { resolveGradleStatic };
