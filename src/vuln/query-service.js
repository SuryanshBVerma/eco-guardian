"use strict";

const { CACHE_TTL_MS } = require("../config/constants");
const { nowMs, hrSeconds } = require("../shared/async");
const { log } = require("../cli/output");
const { loadCache, saveCache } = require("./cache");
const {
  queryOsvForPackages,
  queryNpmBulk,
  queryNvdByCpe,
  makeNvdThrottle,
} = require("./providers");
const { buildJavaEvidence } = require("../java/evidence");
const {
  normalizeNpmAdvisory,
  dedupeAdvisories,
  normalizeNvdCve,
  dedupeAcrossSources,
  advisoryPasses,
} = require("./normalizers");

function parseVersion(version) {
  const cleaned = String(version || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/[-+].*$/, "");
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
  };
}

function cmpVersion(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function expandCaret(versionText) {
  const version = parseVersion(versionText);
  if (!version) return null;
  const upper =
    version.major > 0
      ? `${version.major + 1}.0.0`
      : version.minor > 0
        ? `0.${version.minor + 1}.0`
        : `0.0.${version.patch + 1}`;
  return [
    { op: ">=", version },
    { op: "<", version: parseVersion(upper) },
  ];
}

function expandTilde(versionText) {
  const version = parseVersion(versionText);
  if (!version) return null;
  const upper = `${version.major}.${version.minor + 1}.0`;
  return [
    { op: ">=", version },
    { op: "<", version: parseVersion(upper) },
  ];
}

function matchesComparator(pkgVersion, comparator) {
  const v = parseVersion(pkgVersion);
  if (!v) return false;
  const rhs = comparator.version;
  if (!rhs) return false;
  const c = cmpVersion(v, rhs);

  if (comparator.op === "<") return c < 0;
  if (comparator.op === "<=") return c <= 0;
  if (comparator.op === ">") return c > 0;
  if (comparator.op === ">=") return c >= 0;
  return c === 0;
}

function parseComparatorToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return [];

  const caret = trimmed.match(/^\^v?(\d+(?:\.\d+){0,2})$/);
  if (caret) return expandCaret(caret[1]) || [];

  const tilde = trimmed.match(/^~v?(\d+(?:\.\d+){0,2})$/);
  if (tilde) return expandTilde(tilde[1]) || [];

  const wildcard = trimmed.match(
    /^v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/,
  );
  if (wildcard && /x|X|\*/.test(trimmed)) {
    const major = Number(wildcard[1]);
    const minorWildcard = !wildcard[2] || /x|X|\*/.test(wildcard[2]);
    const patchWildcard = !wildcard[3] || /x|X|\*/.test(wildcard[3]);
    if (minorWildcard) {
      return [
        { op: ">=", version: parseVersion(`${major}.0.0`) },
        { op: "<", version: parseVersion(`${major + 1}.0.0`) },
      ];
    }
    if (patchWildcard) {
      const minor = Number(wildcard[2]);
      return [
        { op: ">=", version: parseVersion(`${major}.${minor}.0`) },
        { op: "<", version: parseVersion(`${major}.${minor + 1}.0`) },
      ];
    }
  }

  const comparator = trimmed.match(/^(<=|>=|<|>|=)?\s*v?(\d+(?:\.\d+){0,2})$/);
  if (comparator) {
    return [{ op: comparator[1] || "=", version: parseVersion(comparator[2]) }];
  }

  return [];
}

function advisoryRangeMatchesVersion(rangeExpr, pkgVersion) {
  const expr = String(rangeExpr || "").trim();
  if (!expr) return true;
  const groups = expr
    .split(/\|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (groups.length === 0) return true;

  for (const group of groups) {
    const hyphen = group.match(/^(.+?)\s+-\s+(.+)$/);
    if (hyphen) {
      const lower = parseVersion(hyphen[1].trim().replace(/^v/i, ""));
      const upper = parseVersion(hyphen[2].trim().replace(/^v/i, ""));
      if (lower && upper) {
        if (
          matchesComparator(pkgVersion, { op: ">=", version: lower }) &&
          matchesComparator(pkgVersion, { op: "<=", version: upper })
        ) {
          return true;
        }
      }
      continue;
    }

    const tokens = group
      .replace(/,/g, " ")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) continue;

    const comparators = [];
    for (const token of tokens) {
      comparators.push(...parseComparatorToken(token));
    }
    if (comparators.length === 0) continue;

    const allMatch = comparators.every((comp) =>
      matchesComparator(pkgVersion, comp),
    );
    if (allMatch) return true;
  }
  return false;
}

async function queryVulnerabilities(packageMap, options) {
  const started = nowMs();
  const packages = Array.from(packageMap.values());
  const queryablePackages = packages.filter(
    (pkg) =>
      pkg.queryable !== false && pkg.version && pkg.version !== "unresolved",
  );
  const cache = await loadCache(options);
  const results = {};
  const diagnostics = {
    retries: 0,
    osvErrors: 0,
    npmErrors: 0,
    nvdErrors: 0,
    nvdRequests: 0,
    partialProviderFailure: false,
  };

  const cachedKeys = [];
  const uncachedPackages = [];
  for (const pkg of queryablePackages) {
    if (cache.results[pkg.key]) cachedKeys.push(pkg.key);
    else uncachedPackages.push(pkg);
  }

  for (const key of cachedKeys) {
    const cached = cache.results[key];
    const advisories = Array.isArray(cached.advisories)
      ? cached.advisories.filter((a) => advisoryPasses(a, options.severity))
      : [];
    results[key] = { vulnerable: advisories.length > 0, advisories };
  }

  let osvResults = {};
  let osvFailed = false;
  if (uncachedPackages.length > 0) {
    try {
      osvResults = await queryOsvForPackages(
        uncachedPackages,
        options,
        diagnostics,
      );
    } catch (error) {
      osvFailed = true;
      diagnostics.partialProviderFailure = true;
      log("warn", `OSV unavailable: ${error.message}`, options);
    }
  }

  const npmTarget = (
    osvFailed
      ? uncachedPackages
      : uncachedPackages.filter(
          (pkg) => osvResults[pkg.key] && osvResults[pkg.key].vulnerable,
        )
  ).filter((pkg) => pkg.ecosystem === "npm");
  let npmCross = {};
  if (npmTarget.length > 0) {
    const byName = {};
    for (const pkg of npmTarget) {
      const name = pkg.name;
      const version = pkg.version;
      if (!byName[name]) byName[name] = [];
      byName[name].push(version);
    }
    try {
      npmCross = await queryNpmBulk(byName, options, diagnostics);
    } catch (error) {
      diagnostics.partialProviderFailure = true;
      log(
        "warn",
        `npm advisory cross-check unavailable: ${error.message}`,
        options,
      );
    }
  }

  if (
    osvFailed &&
    Object.keys(npmCross).length === 0 &&
    uncachedPackages.length > 0
  ) {
    throw new Error(
      "No vulnerability scan possible. OSV and npm advisory endpoints are unreachable.",
    );
  }

  for (const pkg of uncachedPackages) {
    const key = pkg.key;
    const pkgName = pkg.name;
    const pkgVersion = pkg.version;

    const advisories = [];
    if (osvResults[key] && Array.isArray(osvResults[key].advisories)) {
      advisories.push(...osvResults[key].advisories);
    }

    const npmItems = npmCross[pkgName];
    if (Array.isArray(npmItems)) {
      for (const raw of npmItems) {
        const vulnerableVersions = raw.vulnerable_versions
          ? String(raw.vulnerable_versions)
          : "";
        if (
          !vulnerableVersions ||
          advisoryRangeMatchesVersion(vulnerableVersions, pkgVersion)
        ) {
          advisories.push(normalizeNpmAdvisory(raw));
        }
      }
    }

    const filtered = dedupeAdvisories(advisories).filter((a) =>
      advisoryPasses(a, options.severity),
    );
    const record = { vulnerable: filtered.length > 0, advisories: filtered };
    results[key] = record;
    cache.results[key] = record;
  }

  if (options.dependencyCheckMode) {
    const JAVA_ECOSYSTEMS = new Set(["maven", "gradle"]);
    const javaPkgs = queryablePackages.filter((pkg) =>
      JAVA_ECOSYSTEMS.has(String(pkg.ecosystem || "").toLowerCase()),
    );
    if (javaPkgs.length > 0) {
      log(
        "info",
        `NVD dependency-check mode: enriching ${javaPkgs.length} Java package(s)`,
        options,
      );
      const throttle = makeNvdThrottle(!!options.nvdApiKey);
      const progress = { done: 0, total: javaPkgs.length };
      const estSec = options.nvdApiKey
        ? Math.ceil((javaPkgs.length / 40) * 30)
        : Math.ceil((javaPkgs.length / 3) * 30);
      log(
        "info",
        `NVD: ${javaPkgs.length} CPE requests — est. ~${estSec}s${options.nvdApiKey ? " (authenticated)" : " (unauthenticated, 3 req/30s)"}`,
        options,
      );

      for (const pkg of javaPkgs) {
        const evidence = buildJavaEvidence(pkg);
        const label = `[${++progress.done}/${progress.total}] `;
        diagnostics.nvdRequests += 1;

        const cves = await queryNvdByCpe(
          evidence.artifactId,
          evidence.version,
          evidence.groupId,
          options,
          diagnostics,
          throttle,
          label,
        );
        const nvdAdvisories = cves.map((cve) =>
          normalizeNvdCve(cve, { confidence: "high" }),
        );

        if (nvdAdvisories.length > 0) {
          const existing = results[pkg.key] || {
            vulnerable: false,
            advisories: [],
          };
          const merged = dedupeAcrossSources([
            ...existing.advisories,
            ...nvdAdvisories,
          ]);
          const finalFiltered = dedupeAdvisories(merged).filter((a) =>
            advisoryPasses(a, options.severity),
          );
          results[pkg.key] = {
            vulnerable: finalFiltered.length > 0,
            advisories: finalFiltered,
          };
        }
      }
    }
  }

  cache.generated = Date.now();
  cache.ttl_ms = CACHE_TTL_MS;
  await saveCache(cache, options);
  log(
    "success",
    `Vulnerability query complete in ${hrSeconds(started)}s`,
    options,
  );
  Object.defineProperty(results, "__diagnostics", {
    value: diagnostics,
    enumerable: false,
  });
  return results;
}

module.exports = {
  queryVulnerabilities,
  advisoryRangeMatchesVersion,
};
