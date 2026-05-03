"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  CONAN_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parseConanLock(content, filePath) {
  const records = [];
  let data;
  try {
    data = JSON.parse(content);
  } catch (_) {
    return records;
  }

  // Conan 2.x lock format: { "version": "0.5", "graph_lock": { "nodes": { ... } } }
  const nodes = (data.graph_lock && data.graph_lock.nodes) || data.nodes || {};

  for (const [, node] of Object.entries(nodes)) {
    if (!node || !node.ref) continue;
    // ref format: "pkg/1.2.3" or "pkg/1.2.3@user/channel"
    const ref = node.ref;
    const atIdx = ref.indexOf("@");
    const cleanRef = atIdx !== -1 ? ref.substring(0, atIdx) : ref;
    const slashIdx = cleanRef.lastIndexOf("/");
    if (slashIdx === -1) continue;
    const name = cleanRef.substring(0, slashIdx);
    const version = cleanRef.substring(slashIdx + 1);
    if (name && version) {
      records.push(createConanRecord(name, version, filePath, "conan.lock"));
    }
  }
  return records;
}

function createConanRecord(name, version, filePath, rawSource) {
  return {
    key: `conan|${name}|${version}`,
    ecosystem: "conan",
    name,
    version,
    osvEcosystem: "ConanCenter",
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

async function collectConanPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    CONAN_MANIFEST_NAMES,
    options,
    counters,
    "Conan manifests",
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
      if (file === "conan.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parseConanLock(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} Conan dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseConanLock,
  collectConanPackages,
};
