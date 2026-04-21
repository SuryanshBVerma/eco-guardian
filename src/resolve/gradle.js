"use strict";

const shared = require("./shared");
const path = require("path");
const fs = require("fs");

async function resolveGradlePackages(roots, options, state) {
  const { RESOLUTION_CONCURRENCY } = require("../config/constants");
  const { asyncPool } = require("../shared/async");
  const packageMap = new Map();
  const rootsArray = Array.isArray(roots) ? roots : [roots];
  const total = rootsArray.length;
  let resolvedCount = 0;

  if (total > 1) {
    process.stderr.write(
      `[INFO] Resolving Gradle graphs for ${total} directories...\n`,
    );
  }

  const timer =
    total > 1
      ? setInterval(() => {
          process.stderr.write(
            `\r Resolving Gradle graphs... ${resolvedCount}/${total}`,
          );
        }, 200)
      : null;

  try {
    await asyncPool(RESOLUTION_CONCURRENCY, rootsArray, async (root) => {
      try {
        const wrapper = path.join(root, process.platform === "win32" ? "gradlew.bat" : "gradlew");
        const cmd = fs.existsSync(wrapper) ? (process.platform === "win32" ? wrapper : "./gradlew") : "gradle";
        
        const stdout = await shared.execAsync(
          `${cmd} dependencies --console=plain`,
          { cwd: root },
        );
        const lines = stdout.split(/\r?\n/);

        const stack = [];
        for (const line of lines) {
          // Match lines like: "+--- org.slf4j:slf4j-api:1.7.25" or "|    \--- com.google.guava:guava:27.0-jre"
          // We look for the first occurrence of group:name:version
          const match = line.match(/^([| ]*[+\-\\ ]+)?([^:\s]+):([^:\s]+):([^:\s]+)(\s.*)?$/);
          if (!match) continue;

          const indentStr = match[1] || "";
          // Each level is typically 5 characters: "+--- " or "|    "
          const depth = indentStr ? Math.floor(indentStr.length / 5) : 0;
          const groupId = match[2];
          const artifactId = match[3];
          let version = match[4];
          const extra = match[5] || "";
          
          // Gradle output might show version transitions like "1.2.3 -> 1.2.4"
          if (extra.includes(" -> ")) {
            version = extra.split(" -> ")[1].trim();
          } else if (version.includes(" -> ")) {
            version = version.split(" -> ")[1].trim();
          }

          const name = `${groupId}:${artifactId}`;

          // Only depth > 0 are dependencies (depth 0 is usually the configuration name or project itself)
          if (depth === 0) continue;

          while (stack.length >= depth) stack.pop();
          const currentPath = [
            ...stack.map((s) => `${s.name}@${s.version}`),
            `${name}@${version}`,
          ];
          stack.push({ name, version });

          const pkg = shared.createGraphPackage(
            "gradle",
            name,
            version,
            currentPath,
            depth,
          );
          pkg.osvEcosystem = "Maven"; // Crucial for OSV lookups

          const key = pkg.key;
          const existing = packageMap.get(key);
          if (!existing) {
            pkg.paths.push(root);
            pkg.occurrences.push({
              project: path.basename(root),
              manifest_path: path.join(root, "build.gradle"), // Fallback label
              dependency_type: depth === 1 ? "direct" : "transitive",
            });
            packageMap.set(key, pkg);
          } else {
            if (!existing.paths.includes(root)) {
              existing.paths.push(root);
            }
          }
        }
      } catch (err) {
        if (options.verbose) {
          process.stderr.write(
            `\nGradle resolution failed for ${root}: ${err.message}\n`,
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

module.exports = { resolveGradlePackages };
