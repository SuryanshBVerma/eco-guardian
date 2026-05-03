"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  ELIXIR_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parseMixLock(content, filePath) {
  const records = [];

  // mix.lock uses Erlang term format. Two common patterns:
  //   "package_name": {:hex, :app, "1.2.3", ...}
  //   "package_name": {[:hex, :app, "1.2.3", ...]}
  // Newer Elixir uses %{"package_name" => {:hex, :app, "1.2.3", ...}}
  const regex =
    /"([^"]+)"\s*(?::|=>)\s*(?:%\{[^}]*\})?\s*(?:\{|\[)\s*(?::hex|:git),\s*:([^,\s]+),\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const app = match[2];
    const version = match[3];
    // Use the app name when it differs from the package name (typical in Hex)
    const pkgName = app && app !== "nil" ? app : name;
    records.push(createElixirRecord(pkgName, version, filePath, "mix.lock"));
  }
  return records;
}

function createElixirRecord(name, version, filePath, rawSource) {
  return {
    key: `elixir|${name}|${version}`,
    ecosystem: "elixir",
    name,
    version,
    osvEcosystem: "Hex",
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

async function collectElixirPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    ELIXIR_MANIFEST_NAMES,
    options,
    counters,
    "Elixir manifests",
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
      if (file === "mix.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parseMixLock(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} Elixir dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseMixLock,
  collectElixirPackages,
};
