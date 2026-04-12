"use strict";

const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { CACHE_TTL_MS } = require("../config/constants");

function cacheFilePath() {
  return path.join(os.tmpdir(), "eco-guardian-cache.json");
}

async function safeUnlink(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (
      !error ||
      (error.code !== "ENOENT" &&
        error.code !== "EPERM" &&
        error.code !== "EACCES")
    )
      throw error;
  }
}

async function loadCache(options) {
  if (options.noCache)
    return { generated: Date.now(), ttl_ms: CACHE_TTL_MS, results: {} };
  const file = cacheFilePath();
  let raw;
  try {
    raw = await fsp.readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT")
      return { generated: Date.now(), ttl_ms: CACHE_TTL_MS, results: {} };
    return { generated: Date.now(), ttl_ms: CACHE_TTL_MS, results: {} };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    await safeUnlink(file);
    return { generated: Date.now(), ttl_ms: CACHE_TTL_MS, results: {} };
  }

  if (
    !parsed ||
    typeof parsed.generated !== "number" ||
    typeof parsed.ttl_ms !== "number" ||
    typeof parsed.results !== "object" ||
    parsed.results === null
  ) {
    await safeUnlink(file);
    return { generated: Date.now(), ttl_ms: CACHE_TTL_MS, results: {} };
  }

  if (Date.now() - parsed.generated >= parsed.ttl_ms)
    return { generated: Date.now(), ttl_ms: CACHE_TTL_MS, results: {} };
  return parsed;
}

async function saveCache(cache, options) {
  if (options.noCache) return;
  await fsp.writeFile(cacheFilePath(), JSON.stringify(cache), "utf8");
}

module.exports = {
  loadCache,
  saveCache,
};
