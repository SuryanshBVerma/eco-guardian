"use strict";

const fsp = require("fs/promises");
const path = require("path");
const { GRADLE_BUILD_FILES, GRADLE_AUX_FILES } = require("../config/constants");

/**
 * Finds all Gradle projects and their associated files starting from roots.
 * @param {string[]} roots
 * @returns {Promise<Map<string, Set<string>>>} Map of project path to set of Gradle files found
 */
async function discoverGradleProjects(roots) {
  const projectMap = new Map();

  async function walk(dir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    let isProject = false;
    const foundFiles = new Set();

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip common ignore dirs if they aren't handled by discovery.js
        if (
          ["node_modules", ".git", "build", "out", "target"].includes(
            entry.name,
          )
        ) {
          continue;
        }
        await walk(path.join(dir, entry.name));
      } else {
        if (GRADLE_BUILD_FILES.has(entry.name)) {
          isProject = true;
          foundFiles.add(entry.name);
        } else if (GRADLE_AUX_FILES.has(entry.name)) {
          foundFiles.add(entry.name);
        }
      }
    }

    if (isProject || (foundFiles.size > 0 && dir !== roots[0])) {
      projectMap.set(dir, foundFiles);
    }
  }

  for (const root of roots) {
    await walk(root);
  }

  return projectMap;
}

module.exports = { discoverGradleProjects };
