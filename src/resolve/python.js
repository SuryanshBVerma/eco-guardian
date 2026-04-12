"use strict";

const { execAsync, createGraphPackage } = require("./shared");
const path = require("path");

async function resolvePythonPackages(roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require("../config/constants");
  const { asyncPool } = require("../shared/async");
  const packageMap = new Map();
  const rootsArray = Array.isArray(roots) ? roots : [roots];
  const total = rootsArray.length;
  let resolvedCount = 0;

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Python environments for ${total} directories...\n`,
    );
  }

  const timer =
    total > 1
      ? setInterval(() => {
          process.stderr.write(
            `\r Resolving Python environments... ${resolvedCount}/${total}`,
          );
        }, 200)
      : null;

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await execAsync("python -m pip inspect", { cwd: root });
        const data = JSON.parse(stdout);

        if (!data.installed) return;
        for (const dist of data.installed) {
          const name = dist.metadata.name;
          const version = dist.metadata.version;
          if (!name || !version) continue;

          const pkg = createGraphPackage(
            "python",
            name,
            version,
            [`${name}@${version}`],
            1,
          );
          pkg.resolution_mode = "installed";
          const key = pkg.key;
          const existing = packageMap.get(key);
          if (!existing) {
            pkg.paths.push(root);
            pkg.occurrences.push({
              project: path.basename(root),
              manifest_path: "installed-environment",
              dependency_type: "direct",
              source_tool: "pip inspect",
            });
            packageMap.set(key, pkg);
          } else {
            existing.paths.push(root);
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nPython resolution failed for ${root}: ${err.message}\n`,
          );
        }
      } finally {
        resolvedCount++;
      }
    });
  } finally {
    if (timer) {
      clearInterval(timer);
      process.stderr.write("\r");
    }
  }

  return packageMap;
}

module.exports = { resolvePythonPackages };
