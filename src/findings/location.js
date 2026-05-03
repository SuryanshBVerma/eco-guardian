"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { DISCOVERY_CONCURRENCY } = require("../config/constants");
const { asyncPool } = require("../shared/async");

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

async function findOwningProject(packagePath) {
  let current = path.dirname(packagePath);
  const root = path.parse(current).root;
  while (true) {
    if (
      !current.includes(`${path.sep}node_modules${path.sep}`) &&
      !current.endsWith(`${path.sep}node_modules`)
    ) {
      if (await fileExists(path.join(current, "package.json"))) return current;
    }
    if (current === root) break;
    current = path.dirname(current);
  }
  return null;
}

function packageInDependencies(manifest, packageName) {
  const fields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  for (const field of fields) {
    const section = manifest && manifest[field];
    if (
      section &&
      typeof section === "object" &&
      Object.prototype.hasOwnProperty.call(section, packageName)
    ) {
      return true;
    }
  }
  return false;
}

function parseYarnLockForParent(text, packageName) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);
  for (const block of blocks) {
    if (!block.includes("dependencies:")) continue;
    const depRegex = new RegExp(
      `\\n\\s+${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`,
    );
    if (!depRegex.test(block)) continue;
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    const first = lines[0] || "";
    const name = first.split("@")[0].replace(/"/g, "").trim();
    if (name) return { name, version: null };
  }
  return null;
}

function findParentInPackageLock(lock, packageName) {
  if (!lock || typeof lock !== "object") return null;

  if (lock.packages && typeof lock.packages === "object") {
    for (const [pkgPath, meta] of Object.entries(lock.packages)) {
      if (
        !meta ||
        !meta.dependencies ||
        !Object.prototype.hasOwnProperty.call(meta.dependencies, packageName)
      ) {
        continue;
      }
      if (!pkgPath || pkgPath === "") {
        const rootDeps = lock.dependencies || {};
        for (const [name, entry] of Object.entries(rootDeps)) {
          if (
            entry &&
            entry.requires &&
            Object.prototype.hasOwnProperty.call(entry.requires, packageName)
          ) {
            return { name, version: entry.version || null };
          }
        }
        return null;
      }
      const base = pkgPath.split("node_modules/").filter(Boolean).pop();
      if (base) return { name: base, version: meta.version || null };
    }
  }

  function walk(deps) {
    if (!deps || typeof deps !== "object") return null;
    for (const [name, meta] of Object.entries(deps)) {
      if (!meta || typeof meta !== "object") continue;
      if (
        meta.requires &&
        Object.prototype.hasOwnProperty.call(meta.requires, packageName)
      ) {
        return { name, version: meta.version || null };
      }
      const nested = walk(meta.dependencies);
      if (nested) return nested;
    }
    return null;
  }

  return walk(lock.dependencies);
}

async function enrichNpmLocations(paths, packageName, globalRoot) {
  const entries = [];
  await asyncPool(DISCOVERY_CONCURRENCY, paths, async (pkgPath) => {
    const project = await findOwningProject(pkgPath);
    const isGlobal =
      !!globalRoot &&
      path.resolve(pkgPath).startsWith(path.resolve(globalRoot));

    let dependencyType = "transitive";
    let parent = null;
    let manifestPath = null;

    if (project) {
      const manifest = await readJsonSafe(path.join(project, "package.json"));
      dependencyType = packageInDependencies(manifest, packageName)
        ? "direct"
        : "transitive";
      manifestPath = path.join(project, "package.json");
      if (dependencyType === "transitive") {
        const lockPath = path.join(project, "package-lock.json");
        const yarnPath = path.join(project, "yarn.lock");
        if (await fileExists(lockPath)) {
          parent = findParentInPackageLock(
            await readJsonSafe(lockPath),
            packageName,
          );
          manifestPath = lockPath;
        } else if (await fileExists(yarnPath)) {
          parent = parseYarnLockForParent(
            await fsp.readFile(yarnPath, "utf8"),
            packageName,
          );
          manifestPath = yarnPath;
        }
      }
    }

    entries.push({
      path: pkgPath,
      project: project || "(unknown project)",
      manifest_path: manifestPath,
      dependency_type: isGlobal ? "global" : dependencyType,
      parent,
    });
  });

  return entries;
}

module.exports = {
  enrichNpmLocations,
  enrichLocations: enrichNpmLocations,
};
