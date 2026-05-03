"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  PHP_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parseComposerLock(content, filePath) {
  const records = [];
  let data;
  try {
    data = JSON.parse(content);
  } catch (_) {
    return records;
  }

  const sections = data.packages || [];
  const devSections = data["packages-dev"] || [];
  const all = [...sections, ...devSections];

  for (const pkg of all) {
    if (pkg.name && pkg.version) {
      records.push(
        createPhpRecord(pkg.name, pkg.version, filePath, "composer.lock"),
      );
    }
  }
  return records;
}

function createPhpRecord(name, version, filePath, rawSource) {
  return {
    key: `php|${name}|${version}`,
    ecosystem: "php",
    name,
    version,
    osvEcosystem: "Packagist",
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

async function collectPhpPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    PHP_MANIFEST_NAMES,
    options,
    counters,
    "PHP manifests",
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
      if (file === "composer.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parseComposerLock(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} PHP dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseComposerLock,
  collectPhpPackages,
};
