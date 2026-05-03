"use strict";

/**
 * Basic TOML-like parser for libs.versions.toml.
 */
function parseVersionCatalog(content) {
  const result = {
    versions: {},
    libraries: {},
    bundles: {},
  };

  const lines = content.split(/\r?\n/);
  let currentSection = null;

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim();
      continue;
    }

    if (!currentSection) continue;

    const parts = line.split("=");
    if (parts.length < 2) continue;

    const key = parts[0].trim();
    const value = parts.slice(1).join("=").trim();

    if (currentSection === "versions") {
      result.versions[key] = value.replace(/['"]/g, "");
    } else if (currentSection === "libraries") {
      // Format 1: my-lib = "group:artifact:version"
      // Format 2: my-lib = { group = "...", name = "...", version = "..." }
      // Format 3: my-lib = { group = "...", name = "...", version.ref = "..." }
      if (value.startsWith("{")) {
        const entry = {};
        const pairs = value.slice(1, -1).split(",");
        for (const pair of pairs) {
          const [pKey, pVal] = pair
            .split("=")
            .map((s) => s.trim().replace(/['"]/g, ""));
          if (pKey === "version.ref") {
            entry.versionRef = pVal;
          } else {
            entry[pKey] = pVal;
          }
        }
        result.libraries[key] = entry;
      } else {
        const parts = value.replace(/['"]/g, "").split(":");
        if (parts.length === 3) {
          result.libraries[key] = {
            group: parts[0],
            name: parts[1],
            version: parts[2],
          };
        }
      }
    }
  }

  // Resolve version references
  for (const key in result.libraries) {
    const lib = result.libraries[key];
    if (lib.versionRef && result.versions[lib.versionRef]) {
      lib.version = result.versions[lib.versionRef];
    }
  }

  return result;
}

module.exports = { parseVersionCatalog };
