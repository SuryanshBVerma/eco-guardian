"use strict";

const path = require("path");

/**
 * Parses settings.gradle(.kts) to identify subprojects.
 */
function parseGradleSettings(content, filePath) {
  const subprojects = [];

  // Match include 'project-a', ':project-b', 'group:project-c'
  const includeRegex = /include\s+((?:['"][^'"]+['"]\s*,?\s*)+)/g;
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    const rawItems = match[1];
    const items = rawItems.split(/,/).map((s) => s.trim().replace(/['"]/g, ""));
    for (const item of items) {
      if (item) {
        // Normalize path: ':app' -> 'app', 'core:api' -> 'core/api'
        const normalized = item.startsWith(":") ? item.substring(1) : item;
        subprojects.push(normalized.replace(/:/g, "/"));
      }
    }
  }

  return {
    subprojects,
    rootProjectName:
      (content.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/) || [])[1] ||
      path.basename(path.dirname(filePath)),
  };
}

module.exports = { parseGradleSettings };
