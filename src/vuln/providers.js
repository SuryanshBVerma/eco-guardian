"use strict";

const https = require("https");
const {
  VERSION,
  OSV_BATCH_SIZE,
  API_CONCURRENCY,
  HTTP_RETRY_MAX,
  HTTP_RETRY_BASE_MS,
  HTTP_RETRY_MAX_MS,
} = require("../config/constants");
const { chunkArray, asyncPool } = require("../shared/async");
const { log } = require("../cli/output");
const { normalizeOsvAdvisory } = require("./normalizers");

function httpsPost(url, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": `eco-guardian/${VERSION}`,
        },
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }
          try {
            resolve(chunks ? JSON.parse(chunks) : {});
          } catch (_) {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`)),
    );
    req.on("error", (error) =>
      reject(new Error(`Network error for ${url}: ${error.message}`)),
    );
    req.write(payload);
    req.end();
  });
}

function httpsGet(url, timeoutMs = 10000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": `eco-guardian/${VERSION}`,
          Accept: "application/json",
          ...extraHeaders,
        },
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 429) {
            const err = new Error(`HTTP 429 from ${url}`);
            err.retryAfterMs =
              parseInt(res.headers["retry-after"] || "30", 10) * 1000;
            return reject(err);
          }
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }
          try {
            resolve(chunks ? JSON.parse(chunks) : {});
          } catch (_) {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () =>
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms: ${url}`)),
    );
    req.on("error", (error) =>
      reject(new Error(`Network error for ${url}: ${error.message}`)),
    );
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error) {
  const text = String((error && error.message) || "").toLowerCase();
  return (
    text.includes("timeout") ||
    text.includes("network error") ||
    text.includes("http 429") ||
    text.includes("http 500") ||
    text.includes("http 502") ||
    text.includes("http 503") ||
    text.includes("http 504")
  );
}

async function withRetry(fn, diagnostics, metricPrefix) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (diagnostics) {
        diagnostics[`${metricPrefix}Errors`] += 1;
      }

      const is429 = error.message && error.message.includes("429");
      if (attempt >= HTTP_RETRY_MAX || (!isTransientError(error) && !is429)) {
        throw error;
      }

      attempt += 1;
      if (diagnostics) diagnostics.retries += 1;

      let waitMs = Math.min(
        HTTP_RETRY_MAX_MS,
        HTTP_RETRY_BASE_MS * Math.pow(2, attempt - 1),
      );

      // If server provides a Retry-After header, respect it
      if (error.retryAfterMs) {
        waitMs = Math.max(waitMs, error.retryAfterMs);
      }

      const jitter = Math.floor(Math.random() * 100);
      await delay(waitMs + jitter);
    }
  }
}

async function queryOsvForPackages(packages, options, diagnostics = null) {
  if (packages.length === 0) return {};
  const chunks = chunkArray(packages, OSV_BATCH_SIZE);
  log(
    "info",
    `Querying OSV database... (${chunks.length} batches, ${packages.length.toLocaleString()} packages)`,
    options,
  );

  const responses = await asyncPool(API_CONCURRENCY, chunks, async (chunk) => {
    const queries = chunk.map((pkg) => ({
      package: { name: pkg.name, ecosystem: pkg.osvEcosystem || pkg.ecosystem },
      version: pkg.version,
    }));
    return withRetry(
      () => httpsPost("https://api.osv.dev/v1/querybatch", { queries }, 10000),
      diagnostics,
      "osv",
    );
  });

  const uniqueVids = new Set();
  for (let ci = 0; ci < chunks.length; ci += 1) {
    const results =
      responses[ci] && Array.isArray(responses[ci].results)
        ? responses[ci].results
        : [];
    for (const raw of results) {
      if (raw && Array.isArray(raw.vulns)) {
        for (const v of raw.vulns) {
          if (v && v.id) uniqueVids.add(v.id);
        }
      }
    }
  }

  const fullRecords = new Map();
  if (uniqueVids.size > 0) {
    await asyncPool(API_CONCURRENCY, Array.from(uniqueVids), async (vid) => {
      try {
        const details = await withRetry(
          () => httpsGet(`https://api.osv.dev/v1/vulns/${vid}`),
          diagnostics,
          "osv",
        );
        fullRecords.set(vid, details);
      } catch (err) {
        log(
          "error",
          `Failed to fetch full details for ${vid}: ${err.message}`,
          options,
        );
      }
    });
  }

  const out = {};
  for (let ci = 0; ci < chunks.length; ci += 1) {
    const chunk = chunks[ci];
    const results =
      responses[ci] && Array.isArray(responses[ci].results)
        ? responses[ci].results
        : [];
    for (let i = 0; i < chunk.length; i += 1) {
      const raw = results[i];
      const hydratedVulns = [];
      if (raw && Array.isArray(raw.vulns)) {
        for (const v of raw.vulns) {
          const full = fullRecords.get(v.id);
          hydratedVulns.push(full || v);
        }
      }
      const advisories = hydratedVulns.map(normalizeOsvAdvisory);
      out[chunk[i].key] = { vulnerable: advisories.length > 0, advisories };
    }
  }
  return out;
}

async function queryNpmBulk(body, options, diagnostics = null) {
  if (Object.keys(body).length === 0) return {};
  log("info", "Cross-checking npm advisories...", options);
  const data = await withRetry(
    () =>
      httpsPost(
        "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
        body,
        10000,
      ),
    diagnostics,
    "npm",
  );
  return data && typeof data === "object" ? data : {};
}

const NVD_API_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const NVD_RESULTS_PER_PAGE = 20;
const NVD_MAX_PAGES = 5;
// NVD recommends ~6s between requests to stay safely within 50 req/30s limit.
// We use a simple fixed-delay throttle: one slot released every INTERVAL_MS.
const NVD_REQUEST_INTERVAL_MS_AUTH = 650; // ~46 req/30s with key
const NVD_REQUEST_INTERVAL_MS_UNAUTH = 6500; // ~4 req/30s without key

function makeNvdThrottle(hasApiKey) {
  const INTERVAL_MS = hasApiKey
    ? NVD_REQUEST_INTERVAL_MS_AUTH
    : NVD_REQUEST_INTERVAL_MS_UNAUTH;
  let lastFireTime = 0;
  return {
    async acquire() {
      const now = Date.now();
      const since = now - lastFireTime;
      if (since < INTERVAL_MS) {
        await delay(INTERVAL_MS - since);
      }
      lastFireTime = Date.now();
    },
  };
}

async function queryNvdByCpe(
  artifactId,
  version,
  groupId = null,
  options,
  diagnostics = null,
  throttle = null,
  label = "",
) {
  const cleanV = String(version || "")
    .split(":")[0]
    .replace(/^v/, "");
  const apiKey =
    (options && options.nvdApiKey) || process.env.NVD_API_KEY || null;
  const headers = apiKey ? { apiKey } : {};

  const productNames = _buildCpeProductCandidates(artifactId);
  log("info", `${label}Querying NVD for: ${artifactId} ${cleanV}`, options);

  const allCves = [];
  const seenIds = new Set();

  const pushMatch = (cve, confidence, reason) => {
    if (!cve || !cve.id || seenIds.has(cve.id)) return;
    seenIds.add(cve.id);
    allCves.push({ cve, confidence, reason });
  };

  // Pass 1: Precise CPE Match (Multiple candidates)
  for (const product of productNames) {
    // Try wildcard vendor
    let vms = `cpe:2.3:a:*:${product}:${cleanV}:*:*:*:*:*:*:*`;
    let url = `${NVD_API_BASE}?virtualMatchString=${encodeURIComponent(vms)}&resultsPerPage=${NVD_RESULTS_PER_PAGE}`;
    let cves = await _nvdFetch(
      url,
      headers,
      artifactId,
      options,
      diagnostics,
      throttle,
    );

    // If we have a groupId, also try it as a vendor (stripping common prefixes)
    if (cves.length === 0 && groupId) {
      const vendor = String(groupId).split(".").pop(); // e.g. "org.postgresql" -> "postgresql"
      vms = `cpe:2.3:a:${vendor}:${product}:${cleanV}:*:*:*:*:*:*:*`;
      url = `${NVD_API_BASE}?virtualMatchString=${encodeURIComponent(vms)}&resultsPerPage=${NVD_RESULTS_PER_PAGE}`;
      cves = await _nvdFetch(
        url,
        headers,
        artifactId,
        options,
        diagnostics,
        throttle,
      );
    }

    for (const cve of cves) {
      pushMatch(cve, "high", "cpe");
    }
  }

  // Pass 2: Keyword Fallback (if still no results)
  // This helps when the product name in CPE differs significantly (e.g. nimbus_jose+jwt)
  if (allCves.length === 0) {
    const url = `${NVD_API_BASE}?keywordSearch=${encodeURIComponent(artifactId)}&resultsPerPage=10`;
    const cves = await _nvdFetch(
      url,
      headers,
      artifactId,
      options,
      diagnostics,
      throttle,
    );
    for (const cve of cves) {
      if (_cveMentionsVersion(cve, cleanV)) {
        pushMatch(cve, "medium", "keyword-version-match");
      }
    }
  }

  return allCves;
}

/**
 * Heuristic: check if the CVE's CPE match criteria reference our version.
 * Returns true if the version string appears in any CPE criteria or CVE description.
 * Used to filter keyword search results that match the artifact name but not the version.
 */
function _cveMentionsVersion(cve, version) {
  if (!cve || !version) return true;
  const ver = String(version).trim();
  if (!ver) return true;

  const raw = JSON.stringify(cve).toLowerCase();
  if (raw.includes(ver.toLowerCase())) return true;

  const configs = cve.configurations || [];
  for (const config of configs) {
    const nodes = config.nodes || [];
    for (const node of nodes) {
      const matches = node.cpeMatch || [];
      for (const m of matches) {
        const criteria = (m.criteria || "").toLowerCase();
        if (criteria.includes(ver.toLowerCase())) return true;
      }
    }
  }
  return false;
}

/**
 * Generate CPE product name candidates from a Maven artifactId:
 * 1. As-is (e.g., "jackson-databind")
 * 2. Underscore-normalized (e.g., "jackson_databind") — NVD often uses underscores
 */
function _buildCpeProductCandidates(artifactId) {
  const original = String(artifactId || "").toLowerCase();
  const underscored = original.replace(/-/g, "_");
  // Return deduplicated list (no-op if no hyphens)
  return original === underscored ? [original] : [original, underscored];
}

/**
 * Internal fetch helper with retry logic for 429 and NVD API pagination.
 * Loops through result pages (startIndex) up to NVD_MAX_PAGES.
 */
async function _nvdFetch(
  url,
  headers,
  artifactId,
  options,
  diagnostics,
  throttle,
) {
  const allItems = [];
  const seen = new Set();
  let startIndex = 0;

  while (startIndex < NVD_MAX_PAGES * NVD_RESULTS_PER_PAGE) {
    const pageUrl = startIndex === 0 ? url : `${url}&startIndex=${startIndex}`;
    let attempt = 0;
    let pageItems = [];

    while (attempt < 3) {
      if (throttle) await throttle.acquire();
      try {
        const data = await httpsGet(pageUrl, 15000, headers);
        const items =
          data && Array.isArray(data.vulnerabilities)
            ? data.vulnerabilities
            : [];
        pageItems = items.map((item) => item.cve).filter(Boolean);

        for (const item of pageItems) {
          if (item && item.id && !seen.has(item.id)) {
            seen.add(item.id);
            allItems.push(item);
          }
        }

        const total =
          data && typeof data.totalResults === "number" ? data.totalResults : 0;
        if (startIndex + items.length >= total) return allItems;
        if (items.length < NVD_RESULTS_PER_PAGE) return allItems;
        break;
      } catch (err) {
        if (err.message && err.message.includes("404")) {
          return startIndex === 0 ? [] : allItems;
        }
        if (err.message && err.message.includes("429")) {
          const waitMs = (err.retryAfterMs || 30000) + 1000;
          log(
            "warn",
            `NVD rate-limited, waiting ${Math.ceil(waitMs / 1000)}s before retry...`,
            options,
          );
          await delay(waitMs);
          attempt += 1;
          continue;
        }
        if (diagnostics) {
          diagnostics.nvdErrors = (diagnostics.nvdErrors || 0) + 1;
        }
        log(
          "warn",
          `NVD query failed for ${artifactId}: ${err.message}`,
          options,
        );
        if (startIndex > 0) return allItems;
        return [];
      }
    }

    if (pageItems.length < NVD_RESULTS_PER_PAGE) return allItems;
    startIndex += NVD_RESULTS_PER_PAGE;
  }

  return allItems;
}

module.exports = {
  queryOsvForPackages,
  queryNpmBulk,
  queryNvdByCpe,
  makeNvdThrottle,
  isTransientError,
  _buildCpeProductCandidates,
  _cveMentionsVersion,
};
