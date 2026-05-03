"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  RUBY_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { discoverManifestFiles } = require("./discovery");

function parseGemfileLock(content, filePath) {
  const records = [];
  const lines = content.split(/\r?\n/);

  let inSpecs = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inSpecs) {
      if (trimmed === "specs:") inSpecs = true;
      continue;
    }
    // Exit specs section when we hit a non-indented line that starts a new section
    if (trimmed && !line.startsWith("    ") && !line.startsWith("\t")) {
      // Check if this is still within specs (could be next GEM block's specs)
      if (trimmed.endsWith(":") && !trimmed.startsWith("GEM")) {
        continue;
      }
      // If it's a top-level section like PLATFORMS, DEPENDENCIES, etc., stop
      if (
        !line.startsWith(" ") &&
        !line.startsWith("\t") &&
        trimmed.length > 0
      ) {
        inSpecs = false;
        continue;
      }
    }

    if (!line.startsWith("    ") && !line.startsWith("\t")) continue;
    // Remove leading whitespace
    const contentTrimmed = line.replace(/^\s+/, "");

    // Gem line: name (version) or name (version-platform)
    // Only capture top-level spec entries (4-space indent), not dependencies (6+ spaces)
    const gemMatch = contentTrimmed.match(/^([^\s(]+)\s*\(([^)]+)\)/);
    if (gemMatch) {
      const name = gemMatch[1];
      const rawVersion = gemMatch[2];
      // Skip dependency constraint entries like "~> 1.0" or "= 7.0.4"
      if (/[~<>=]/.test(rawVersion)) continue;
      // Strip platform suffix: "1.14.0-x86_64-linux" -> "1.14.0"
      const version = rawVersion.split("-")[0];
      if (name && version && !name.match(/^[a-z]/) === false) {
        records.push(createRubyRecord(name, version, filePath, "Gemfile.lock"));
      }
    }
  }
  return records;
}

function createRubyRecord(name, version, filePath, rawSource) {
  return {
    key: `ruby|${name}|${version}`,
    ecosystem: "ruby",
    name,
    version,
    osvEcosystem: "RubyGems",
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

async function collectRubyPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    RUBY_MANIFEST_NAMES,
    options,
    counters,
    "Ruby manifests",
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
      if (file === "Gemfile.lock") {
        let raw;
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parseGemfileLock(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} Ruby dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parseGemfileLock,
  collectRubyPackages,
};
