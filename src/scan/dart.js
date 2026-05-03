"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  DART_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parsePubspecLock(content, filePath) {
  const records = [];
  const lines = content.split(/\r?\n/);

  // pubspec.lock YAML-like format:
  // packages:
  //   package_name:
  //     dependency: ...
  //     version: "1.2.3"
  const pkgHeaderRegex = /^ {2}([a-zA-Z0-9_]+):$/;
  const knownFields = new Set([
    "sdks",
    "dependency",
    "description",
    "source",
    "version",
    "packages",
    "dependency_overrides",
    "dev_dependencies",
  ]);

  let currentPkg = null;
  for (const line of lines) {
    const pkgMatch = line.match(pkgHeaderRegex);
    if (pkgMatch) {
      const name = pkgMatch[1];
      if (!knownFields.has(name)) {
        currentPkg = name;
      }
      continue;
    }

    if (currentPkg) {
      const versionMatch = line.match(/^\s{4}version:\s*"?([^"\s]+)"?/);
      if (versionMatch) {
        records.push(
          createDartRecord(
            currentPkg,
            versionMatch[1],
            filePath,
            "pubspec.lock",
          ),
        );
        currentPkg = null;
      }
    }
  }
  return records;
}

function createDartRecord(name, version, filePath, rawSource) {
  return {
    key: `dart|${name}|${version}`,
    ecosystem: "dart",
    name,
    version,
    osvEcosystem: "Pub",
    paths: [],
    occurrences: [
      {
        project: path.dirname(filePath),
        manifest_path: filePath,
        dependency_type: "direct",
        raw_source: rawSource,
      },
    ],
  };
}

async function collectDartPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    DART_MANIFEST_NAMES,
    options,
    counters,
    "Dart manifests",
  );

  let totalEntries = 0;

  await asyncPool(PACKAGE_READ_CONCURRENCY, manifestDirs, async (dir) => {
    let files;
    try {
      files = await fsp.readdir(dir);
    } catch (_) {
      return;
    }

    const records = [];
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (file === "pubspec.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parsePubspecLock(raw, filePath));
      }
    }

    totalEntries += records.length;
    for (const record of records) {
      const existing = packageMap.get(record.key);
      if (!existing) {
        record.paths = [dir];
        packageMap.set(record.key, record);
      } else {
        existing.occurrences.push(...record.occurrences);
        existing.paths.push(dir);
      }
    }
  });

  log(
    "info",
    `Harvested ${totalEntries.toLocaleString()} Dart dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parsePubspecLock,
  collectDartPackages,
};
