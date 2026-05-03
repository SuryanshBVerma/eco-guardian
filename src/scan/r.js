"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  R_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parseRenvLock(content, filePath) {
  const records = [];
  let data;
  try {
    data = JSON.parse(content);
  } catch (_) {
    return records;
  }

  const packages = data.Packages || {};
  for (const [name, info] of Object.entries(packages)) {
    if (info && info.Version) {
      records.push(createRRecord(name, info.Version, filePath, "renv.lock"));
    }
  }
  return records;
}

function createRRecord(name, version, filePath, rawSource) {
  return {
    key: `r|${name}|${version}`,
    ecosystem: "r",
    name,
    version,
    osvEcosystem: "CRAN",
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

async function collectRPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    R_MANIFEST_NAMES,
    options,
    counters,
    "R manifests",
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
      if (file === "renv.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parseRenvLock(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} R dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseRenvLock,
  collectRPackages,
};
