"use strict";

const { execAsync, createGraphPackage } = require("./shared");
const path = require("path");

async function resolveNuGetPackages(roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require("../config/constants");
  const { asyncPool } = require("../shared/async");
  const packageMap = new Map();
  const rootsArray = Array.isArray(roots) ? roots : [roots];
  const total = rootsArray.length;
  let resolvedCount = 0;

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving NuGet graphs for ${total} directories...\n`,
    );
  }

  const timer =
    total > 1
      ? setInterval(() => {
          process.stderr.write(
            `\r Resolving NuGet graphs... ${resolvedCount}/${total}`,
          );
        }, 200)
      : null;

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const stdout = await require("./shared").execAsync(
          "dotnet list package --include-transitive --format json",
          { cwd: root },
        );
        const data = JSON.parse(stdout);

        if (!data.projects) return;
        for (const project of data.projects) {
          if (!project.frameworks) continue;
          for (const fw of project.frameworks) {
            if (!fw.topLevelPackages && !fw.transitivePackages) continue;

            const processPkg = (pkgInfo, type) => {
              const name = pkgInfo.id;
              const version =
                pkgInfo.resolvedVersion || pkgInfo.requestedVersion;
              if (!name || !version) return;

              const pkg = createGraphPackage(
                "nuget",
                name,
                version,
                [`${name}@${version}`],
                type === "direct" ? 1 : 2,
              );
              const key = pkg.key;
              const existing = packageMap.get(key);
              if (!existing) {
                pkg.paths.push(root);
                pkg.occurrences.push({
                  project: project.path || path.basename(root),
                  manifest_path: project.path || root,
                  dependency_type: type,
                });
                packageMap.set(key, pkg);
              } else {
                existing.paths.push(root);
              }
            };

            if (fw.topLevelPackages)
              fw.topLevelPackages.forEach((p) => processPkg(p, "direct"));
            if (fw.transitivePackages)
              fw.transitivePackages.forEach((p) => processPkg(p, "transitive"));
          }
        }
      } catch (err) {
        if (options.verbose)
          process.stderr.write(
            `\nNuGet resolution failed for ${root}: ${err.message}\n`,
          );
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

module.exports = { resolveNuGetPackages };
