"use strict";

const shared = require("./shared");
const path = require("path");

async function resolveHaskellPackages(roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require("../config/constants");
  const { asyncPool } = require("../shared/async");
  const packageMap = new Map();
  const rootsArray = Array.isArray(roots) ? roots : [roots];
  const total = rootsArray.length;
  let resolvedCount = 0;

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Haskell graphs for ${total} directories...\n`,
    );
  }

  const timer =
    total > 1
      ? setInterval(() => {
          process.stderr.write(
            `\r Resolving Haskell graphs... ${resolvedCount}/${total}`,
          );
        }, 200)
      : null;

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await shared.execAsync("stack ls dependencies --json", {
          cwd: root,
          timeout: 120000,
        });
        const data = JSON.parse(stdout);

        const deps = Array.isArray(data) ? data : data.dependencies || [];
        for (const dep of deps) {
          const name = dep.name || dep.package || dep.packageName;
          const version = dep.version;
          if (!name || !version) continue;

          const pkg = shared.createGraphPackage(
            "haskell",
            name,
            version,
            [`${name}@${version}`],
            1,
          );
          const key = pkg.key;
          const existing = packageMap.get(key);
          if (!existing) {
            pkg.paths.push(root);
            pkg.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, "stack.yaml"),
              dependency_type: "direct",
            });
            packageMap.set(key, pkg);
          } else {
            existing.paths.push(root);
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nHaskell resolution failed for ${root}: ${err.message}\n`,
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

module.exports = { resolveHaskellPackages };
