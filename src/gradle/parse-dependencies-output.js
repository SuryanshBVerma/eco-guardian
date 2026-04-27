"use strict";

const path = require("path");

function stripGradleMarkers(value) {
  return String(value || "")
    .replace(/\s*\(\*\)\s*$/g, "")
    .replace(/\s*\((?:c|n)\)\s*$/g, "")
    .trim();
}

function extractResolvedVersion(rawVersion, arrowVersion) {
  const candidates = [arrowVersion, rawVersion];

  for (const candidate of candidates) {
    if (!candidate) continue;

    let version = stripGradleMarkers(candidate);

    const braceMatch = version.match(
      /^\{[^}]*?(?:strictly|required|preferred|requires)\s+([^}\s,]+)[^}]*\}$/i,
    );
    if (braceMatch) {
      version = braceMatch[1];
    }

    version = version.replace(/^\{/, "").replace(/\}$/, "").trim();
    if (version) return version;
  }

  return null;
}

function parsePackageNode(body) {
  const cleaned = stripGradleMarkers(body);
  if (!cleaned || cleaned.startsWith("project ")) {
    return null;
  }

  const arrowIndex = cleaned.lastIndexOf(" -> ");
  const rawSpec = arrowIndex === -1 ? cleaned : cleaned.slice(0, arrowIndex).trim();
  const resolvedVersion = arrowIndex === -1 ? null : cleaned.slice(arrowIndex + 4).trim();

  const parts = rawSpec.split(":");
  if (parts.length < 2) {
    return null;
  }

  const group = parts[0] && parts[0].trim();
  const name = parts[1] && parts[1].trim();
  const rawVersion = parts.length > 2 ? parts.slice(2).join(":").trim() : null;
  const version = extractResolvedVersion(rawVersion, resolvedVersion);

  if (!group || !name || !version) {
    return null;
  }

  return {
    group,
    name,
    version,
    coordinate: `${group}:${name}@${version}`,
  };
}

function parseDependencyLine(line) {
  const match = /^([| ]*)(\+---|\\---)\s+(.+)$/.exec(line);
  if (!match) return null;

  const prefix = match[1] || "";
  const body = match[3] || "";
  const depth = Math.floor(prefix.length / 5) + 1;

  if (body.trim().startsWith("project ")) {
    return {
      depth,
      type: "project",
      label: body.trim(),
    };
  }

  const pkg = parsePackageNode(body);
  if (!pkg) return null;

  return {
    depth,
    type: "package",
    ...pkg,
  };
}

function isConfigurationHeading(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(">")) return false;
  if (trimmed.startsWith("Project ")) return false;
  if (trimmed.startsWith("Configure project")) return false;
  if (trimmed.startsWith("No dependencies")) return false;
  if (trimmed.startsWith("(") || trimmed.startsWith("[")) return false;
  if (trimmed.startsWith("+") || trimmed.startsWith("\\") || trimmed.startsWith("|")) return false;

  return /^[A-Za-z][A-Za-z0-9_.-]*(?:\s+-\s+.*)?$/.test(trimmed);
}

function parseGradleDependenciesOutput(output, context = {}) {
  const lines = String(output || "").split(/\r?\n/);
  const records = [];
  const stack = [];
  let currentConfiguration = null;
  const projectName = context.projectName || path.basename(context.projectDir || "");
  const manifestPath = context.manifestPath || path.join(context.projectDir || ".", "build.gradle");

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isConfigurationHeading(line)) {
      currentConfiguration = trimmed.split(" - ", 1)[0].trim();
      stack.length = 0;
      continue;
    }

    const parsed = parseDependencyLine(line);
    if (!parsed) continue;

    if (!currentConfiguration) {
      continue;
    }

    stack[parsed.depth - 1] = parsed;
    stack.length = parsed.depth;

    if (parsed.type !== "package") {
      continue;
    }

    const resolvedPath = stack
      .slice(0, parsed.depth)
      .filter((entry) => entry && entry.type === "package")
      .map((entry) => entry.coordinate);

    records.push({
      key: `gradle|${parsed.group}:${parsed.name}|${parsed.version}`,
      name: `${parsed.group}:${parsed.name}`,
      version: parsed.version,
      resolvedPath,
      depth: parsed.depth,
      configuration: currentConfiguration,
      project: projectName,
      manifestPath,
      dependencyType: parsed.depth === 1 ? "direct" : "transitive",
    });
  }

  return records;
}

module.exports = {
  parseGradleDependenciesOutput,
};