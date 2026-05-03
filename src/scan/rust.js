"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  RUST_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parseCargoLock(content, filePath) {
  const records = [];
  const blocks = content.split(/\[\[package\]\]/);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
    const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);
    if (nameMatch && versionMatch) {
      records.push(
        createRustRecord(nameMatch[1], versionMatch[1], filePath, "Cargo.lock"),
      );
    }
  }
  return records;
}

function createRustRecord(name, version, filePath, rawSource) {
  return {
    key: `rust|${name}|${version}`,
    ecosystem: "rust",
    name,
    version,
    osvEcosystem: "crates.io",
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

async function collectRustPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    RUST_MANIFEST_NAMES,
    options,
    counters,
    "Rust manifests",
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
      if (file === "Cargo.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parseCargoLock(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} Rust dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseCargoLock,
  collectRustPackages,
};
