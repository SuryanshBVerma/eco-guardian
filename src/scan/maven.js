"use strict";

const fsp = require("fs/promises");
const path = require("path");
const {
  PACKAGE_READ_CONCURRENCY,
  MAVEN_MANIFEST_NAMES,
} = require("../config/constants");
const { asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { extractTagText, extractAllElements } = require("../shared/xml-lite");
const { discoverManifestFiles } = require("./discovery");

function resolveProperty(version, properties) {
  if (!version || typeof version !== "string") return version;
  if (version.startsWith("${") && version.endsWith("}")) {
    const propName = version.slice(2, -1);
    if (Object.prototype.hasOwnProperty.call(properties, propName)) {
      return properties[propName];
    }
  }
  return version;
}

function parsePomDependencies(xmlText, filePath) {
  const records = [];

  const properties = {};
  const propertiesElems = extractAllElements(xmlText, "properties");
  for (const propsElem of propertiesElems) {
    const regex = /<([^/>]+)>([^<]+)<\/\1>/g;
    let match;
    while ((match = regex.exec(propsElem)) !== null) {
      properties[match[1]] = match[2].trim();
    }
  }

  const dependencyManagement = {};
  const dmElems = extractAllElements(xmlText, "dependencyManagement");
  for (const dmElem of dmElems) {
    const deps = extractAllElements(dmElem, "dependency");
    for (const dep of deps) {
      const g = extractTagText(dep, "groupId");
      const a = extractTagText(dep, "artifactId");
      const v = extractTagText(dep, "version");
      if (g && a && v) {
        dependencyManagement[`${g}:${a}`] = resolveProperty(v, properties);
      }
    }
  }

  let cleanedXml = xmlText;
  for (const dmElem of dmElems) {
    cleanedXml = cleanedXml.replace(dmElem, "");
  }

  const deps = extractAllElements(cleanedXml, "dependency");
  for (const dep of deps) {
    const g = extractTagText(dep, "groupId");
    const a = extractTagText(dep, "artifactId");

    if (!g || !a) continue;

    const rawV = extractTagText(dep, "version");
    const v =
      resolveProperty(rawV, properties) || dependencyManagement[`${g}:${a}`];

    const name = `${g}:${a}`;
    const version = v || null;

    if (!version) {
      records.push({
        key: `Maven|${name}|unresolved`,
        ecosystem: "Maven",
        name,
        version: "unresolved",
        unresolved: true,
        queryable: false,
        osvEcosystem: "Maven",
        paths: [],
        occurrences: [
          {
            project: path.dirname(filePath),
            manifest_path: filePath,
            dependency_type: "direct",
            raw_source: "pom.xml",
          },
        ],
      });
      continue;
    }

    records.push({
      key: `Maven|${name}|${version}`,
      ecosystem: "Maven",
      name,
      version,
      osvEcosystem: "Maven",
      paths: [],
      occurrences: [
        {
          project: path.dirname(filePath),
          manifest_path: filePath,
          dependency_type: "direct",
          raw_source: "pom.xml",
        },
      ],
    });
  }

  return records;
}

async function collectMavenPackages(roots, options, state) {
  const packageMap = new Map();
  const counters = { found: 0, skippedPermissions: 0 };

  const manifestDirs = await discoverManifestFiles(
    roots,
    MAVEN_MANIFEST_NAMES,
    options,
    counters,
    "Maven POMs",
  );

  let totalEntries = 0;

  await asyncPool(PACKAGE_READ_CONCURRENCY, manifestDirs, async (dir) => {
    const filePath = path.join(dir, "pom.xml");
    let raw;
    try {
      raw = await fsp.readFile(filePath, "utf8");
    } catch (_) {
      return;
    }

    const deps = parsePomDependencies(raw, filePath);
    totalEntries += deps.length;

    for (const record of deps) {
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
    `Harvested ${totalEntries.toLocaleString()} Maven dependency entries -> ${packageMap.size.toLocaleString()} unique combinations`,
    options,
  );
  return packageMap;
}

module.exports = {
  parsePomDependencies,
  collectMavenPackages,
};
