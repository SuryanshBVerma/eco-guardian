"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  NUGET_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const {
  extractTagText,
  extractAllElements,
  extractAttr,
} = require("../shared/xml-lite");
const { discoverManifestFiles } = require("./discovery");

async function findNearestDirectoryPackagesProps(startDir) {
  let current = startDir;
  while (true) {
    const propsPath = path.join(current, "Directory.Packages.props");
    try {
      await fsp.access(propsPath);
      return propsPath;
    } catch (_) {}

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function parsePackagesLockJson(jsonText, filePath) {
  const records = [];
  try {
    const data = JSON.parse(jsonText);
    const deps = data.dependencies || {};
    for (const framework of Object.keys(deps)) {
      const frameworksDeps = deps[framework] || {};
      for (const id of Object.keys(frameworksDeps)) {
        const info = frameworksDeps[id];
        const version = typeof info === "string" ? info : info.resolved;
        if (id && version) {
          records.push(
            createNuGetRecord(
              id,
              version,
              filePath,
              "packages.lock.json",
              true,
            ),
          );
        }
      }
    }
  } catch (_) {}
  return records;
}

function createNuGetRecord(
  name,
  version,
  filePath,
  rawSource,
  isDirect = true,
) {
  return {
    key: `NuGet|${name}|${version}`,
    ecosystem: "NuGet",
    name,
    version,
    osvEcosystem: "NuGet",
    paths: [],
    occurrences: [
      {
        project: path.dirname(filePath),
        manifest_path: filePath,
        dependency_type: isDirect ? "direct" : "transitive",
        raw_source: rawSource,
      },
    ],
  };
}

function parsePackagesConfig(xmlText, filePath) {
  const records = [];
  const pkgElems = extractAllElements(xmlText, "package");
  for (const pkg of pkgElems) {
    const id = extractAttr(pkg, "id");
    const version = extractAttr(pkg, "version");
    if (id && version) {
      records.push(createNuGetRecord(id, version, filePath, "packages.config"));
    }
  }
  return records;
}

function parseProjectPackageReferences(
  xmlText,
  filePath,
  centralVersions = new Map(),
) {
  const records = [];
  const refElems = extractAllElements(xmlText, "PackageReference");

  for (const ref of refElems) {
    const id = extractAttr(ref, "Include") || extractAttr(ref, "Update");
    if (!id) continue;

    let version = extractAttr(ref, "Version");
    if (!version) version = extractTagText(ref, "Version");

    if (!version && centralVersions.has(id)) {
      version = centralVersions.get(id);
    }

    if (id && version) {
      records.push(
        createNuGetRecord(id, version, filePath, path.basename(filePath)),
      );
    }
  }
  return records;
}

function parseDirectoryPackagesProps(xmlText, filePath) {
  const versions = new Map();
  const centralElems = extractAllElements(xmlText, "PackageVersion");
  for (const pv of centralElems) {
    const id = extractAttr(pv, "Include") || extractAttr(pv, "Update");
    let version = extractAttr(pv, "Version");
    if (!version) version = extractTagText(pv, "Version");
    if (id && version) versions.set(id, version);
  }
  return versions;
}

async function collectNuGetPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    NUGET_MANIFEST_NAMES,
    options,
    counters,
    "NuGet manifests",
  );

  let totalEntries = 0;

  const centralVersionsByDir = new Map();

  for (const dir of manifestDirs) {
    const propsPath = await findNearestDirectoryPackagesProps(dir);
    if (propsPath) {
      try {
        const raw = await fsp.readFile(propsPath, "utf8");
        const versions = parseDirectoryPackagesProps(raw, propsPath);
        centralVersionsByDir.set(dir, versions);
      } catch (_) {}
    }
  }

  await asyncPool(PACKAGE_READ_CONCURRENCY, manifestDirs, async (dir) => {
    let files;
    try {
      files = await fsp.readdir(dir);
    } catch (_) {
      return;
    }

    const records = [];
    const propsVersions = centralVersionsByDir.get(dir) || new Map();

    for (const file of files) {
      const filePath = path.join(dir, file);
      let raw;

      if (file === "packages.config") {
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parsePackagesConfig(raw, filePath));
      } else if (
        file.endsWith(".csproj") ||
        file.endsWith(".vbproj") ||
        file.endsWith(".fsproj")
      ) {
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(
          ...parseProjectPackageReferences(raw, filePath, propsVersions),
        );
      } else if (file === "packages.lock.json") {
        try {
          raw = await fsp.readFile(filePath, "utf8");
        } catch (_) {
          continue;
        }
        records.push(...parsePackagesLockJson(raw, filePath));
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
    `Harvested ${totalEntries.toLocaleString()} NuGet dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parsePackagesConfig,
  parseProjectPackageReferences,
  parseDirectoryPackagesProps,
  parsePackagesLockJson,
  collectNuGetPackages,
};
