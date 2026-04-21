"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  GRADLE_BUILD_FILES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

/**
 * Parses Gradle lockfiles (gradle.lockfile or buildscript-gradle.lockfile).
 * Format is usually group:name:version=config1,config2 or just group:name:version
 */
function parseGradleLockfile(content, filePath) {
  const records = [];
  const lines = content.split(/\r?\n/);
  const project = path.dirname(filePath);

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    // Remove anything after '=' if present
    const part = line.split("=")[0].trim();
    const parts = part.split(":");

    if (parts.length === 3) {
    let [g, a, v] = parts;
    g = g.replace(/\0/g, "");
    a = a.replace(/\0/g, "");
    v = v.replace(/\0/g, "");
    const name = `${g}:${a}`;
      records.push({
        key: `gradle|${name}|${v}`,
        ecosystem: "gradle",
        name,
        version: v,
        osvEcosystem: "Maven",
        paths: [],
        occurrences: [
          {
            project,
            manifest_path: filePath,
            dependency_type: "direct", // Locked versions are effectively pinned
            raw_source: path.basename(filePath),
          },
        ],
      });
    }
  }
  return records;
}

/**
 * Conservative regex-based parser for build.gradle and build.gradle.kts.
 * Only looks for literal 'group:name:version' or group: "g", name: "n", version: "v"
 */
function parseGradleBuildDependencies(content, filePath) {
  const records = [];
  const project = path.dirname(filePath);

  // Match implementation("org.slf4j:slf4j-api:1.7.25") or implementation '...'
  const literalRegex = /(['"])([^'":\s]+):([^'":\s]+):([^'":\s]+)\1/g;
  let match;
  while ((match = literalRegex.exec(content)) !== null) {
    let [, , g, a, v] = match;
    g = g.replace(/\0/g, "");
    a = a.replace(/\0/g, "");
    v = v.replace(/\0/g, "");
    const name = `${g}:${a}`;
    records.push({
      key: `gradle|${name}|${v}`,
      ecosystem: "gradle",
      name,
      version: v,
      osvEcosystem: "Maven",
      paths: [],
      occurrences: [
        {
          project,
          manifest_path: filePath,
          dependency_type: "direct",
          raw_source: path.basename(filePath),
        },
      ],
    });
  }

  // Match group: "org.slf4j", name: "slf4j-api", version: "1.7.25"
  const mapRegex = /group\s*[:=]\s*(['"])([^'"]+)\1\s*,\s*name\s*[:=]\s*(['"])([^'"]+)\3\s*,\s*version\s*[:=]\s*(['"])([^'"]+)\5/g;
  while ((match = mapRegex.exec(content)) !== null) {
    let [, , g, , a, , v] = match;
    g = g.replace(/\0/g, "");
    a = a.replace(/\0/g, "");
    v = v.replace(/\0/g, "");
    const name = `${g}:${a}`;
    records.push({
      key: `gradle|${name}|${v}`,
      ecosystem: "gradle",
      name,
      version: v,
      osvEcosystem: "Maven",
      paths: [],
      occurrences: [
        {
          project,
          manifest_path: filePath,
          dependency_type: "direct",
          raw_source: path.basename(filePath),
        },
      ],
    });
  }

  return records;
}

async function collectGradlePackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const projectDirs = await discoverManifestFiles(
    roots,
    GRADLE_BUILD_FILES,
    options,
    counters,
    "Gradle projects",
  );

  let totalEntries = 0;

  await asyncPool(PACKAGE_READ_CONCURRENCY, projectDirs, async (dir) => {
    const filesInDir = [
      "gradle.lockfile",
      "buildscript-gradle.lockfile",
      "build.gradle",
      "build.gradle.kts",
    ];

    for (const fileName of filesInDir) {
      const filePath = path.join(dir, fileName);
      let content;
      try {
        content = await fsp.readFile(filePath, "utf8");
      } catch (_) {
        continue;
      }

      let deps = [];
      if (fileName.includes("lockfile")) {
        deps = parseGradleLockfile(content, filePath);
      } else {
        deps = parseGradleBuildDependencies(content, filePath);
      }

      totalEntries += deps.length;

      for (const record of deps) {
        const existing = packageMap.get(record.key);
        if (!existing) {
          record.paths = [dir];
          packageMap.set(record.key, record);
        } else {
          existing.occurrences.push(...record.occurrences);
          if (!existing.paths.includes(dir)) {
            existing.paths.push(dir);
          }
        }
      }
    }
  });

  log(
    "info",
    `Harvested ${totalEntries.toLocaleString()} Gradle dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseGradleLockfile,
  parseGradleBuildDependencies,
  collectGradlePackages,
};
