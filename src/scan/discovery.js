"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  PLATFORM,
  API_CONCURRENCY,
  DISCOVERY_CONCURRENCY,
  WALK_SKIP_NAMES,
} = require("../config/constants");
const { asyncPool, nowMs, hrSeconds } = require("../shared/async");
const { runCommand } = require("../shared/command");
const {
  filterNestedNodeModules,
  dedupePaths,
  toRootPathWindows,
} = require("../shared/path-utils");
const { log } = require("../cli/output");

async function discoverWindowsDrives() {
  const drives = [];
  const wmic = await runCommand("wmic", ["logicaldisk", "get", "name"]);
  if (wmic.ok && wmic.stdout) {
    const lines = wmic.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      const root = toRootPathWindows(line.replace(/\s+/g, ""));
      if (root) drives.push(root);
    }
  }
  if (drives.length > 0) return Array.from(new Set(drives));

  const fallback = [];
  for (let i = 67; i <= 90; i += 1) {
    const root = `${String.fromCharCode(i)}:\\`;
    try {
      await fsp.access(root, fs.constants.R_OK);
      fallback.push(root);
    } catch (_) {}
  }
  return fallback.length > 0 ? fallback : ["C:\\"];
}

async function getGlobalNpmRoot() {
  if (process.env.NPM_GUARDIAN_DISABLE_GLOBAL === "1") return null;
  const result = await runCommand("npm", ["root", "-g"]);
  if (!result.ok) return null;
  return (
    result.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean) || null
  );
}

async function discoverScanRoots(options, state) {
  const roots = [];
  const globalRoot = await getGlobalNpmRoot();
  if (!globalRoot) state.globalRootUnavailable = true;

  if (options.globalOnly) {
    if (globalRoot) roots.push(globalRoot);
    return { roots: dedupePaths(roots), globalRoot };
  }

  if (options.pathExplicit) roots.push(options.path);
  else if (PLATFORM === "win32") roots.push(...(await discoverWindowsDrives()));
  else {
    roots.push(os.homedir());
    if (options.global || options.allDrives) roots.push("/");
  }

  if (globalRoot) roots.push(globalRoot);
  return { roots: dedupePaths(roots), globalRoot };
}

async function discoverNodeModulesViaNative(root) {
  if (PLATFORM === "darwin") {
    const result = await runCommand(
      "mdfind",
      ["-name", "node_modules", "-onlyin", root],
      { timeoutMs: 30000 },
    );
    if (!result.ok) return { ok: false, paths: [] };
    return {
      ok: true,
      paths: result.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (PLATFORM === "linux") {
    const result = await runCommand(
      "locate",
      ["-b", "\\node_modules", "--existing"],
      { timeoutMs: 30000 },
    );
    if (!result.ok) return { ok: false, paths: [] };
    const all = result.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const normalizedRoot = path.resolve(root);
    return {
      ok: true,
      paths: all.filter((candidate) => {
        const resolved = path.resolve(candidate);
        return (
          resolved === normalizedRoot ||
          resolved.startsWith(`${normalizedRoot}${path.sep}`)
        );
      }),
    };
  }
  if (PLATFORM === "win32") {
    const target = path.join(root, "node_modules");
    const result = await runCommand(
      "cmd",
      ["/d", "/s", "/c", `dir /s /b /ad "${target}"`],
      { timeoutMs: 45000 },
    );
    if (!result.ok) return { ok: false, paths: [] };
    return {
      ok: true,
      paths: result.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  return { ok: false, paths: [] };
}

async function walkForNodeModules(roots, counters) {
  const found = [];
  const queue = roots.map((r) => path.resolve(r));
  let index = 0;

  async function worker() {
    while (true) {
      const current = queue[index];
      if (!current) return;
      index += 1;

      let dirents;
      try {
        dirents = await fsp.readdir(current, { withFileTypes: true });
      } catch (error) {
        if (
          error &&
          (error.code === "EACCES" ||
            error.code === "EPERM" ||
            error.code === "ENOENT" ||
            error.code === "ENOTDIR")
        )
          counters.skippedPermissions += 1;
        continue;
      }

      for (const dirent of dirents) {
        if (!dirent.isDirectory || !dirent.isDirectory()) continue;
        if (dirent.isSymbolicLink && dirent.isSymbolicLink()) continue;
        const name = dirent.name;
        const child = path.join(current, name);

        if (name === "node_modules") {
          found.push(child);
          counters.found = found.length;
          continue;
        }
        if (WALK_SKIP_NAMES.has(name)) continue;
        queue.push(child);
      }
    }
  }

  await Promise.all(
    Array.from({ length: DISCOVERY_CONCURRENCY }, () => worker()),
  );
  return found;
}

async function discoverNodeModules(roots, options, counters) {
  const started = nowMs();
  const timer = setInterval(() => {
    process.stderr.write(
      `\r Searching for node_modules... ${counters.found} found`,
    );
  }, 120);

  try {
    const nativePerRoot = await asyncPool(
      Math.min(API_CONCURRENCY, Math.max(1, roots.length)),
      roots,
      (root) => discoverNodeModulesViaNative(root),
    );
    const nativeResults = [];
    for (const item of nativePerRoot)
      if (item && item.ok) nativeResults.push(...item.paths);

    let all = filterNestedNodeModules(nativeResults);
    if (all.length === 0) {
      all = filterNestedNodeModules(await walkForNodeModules(roots, counters));
    }

    counters.found = all.length;
    process.stderr.write("\r");
    log(
      "success",
      `Found ${all.length} node_modules directories in ${hrSeconds(started)}s`,
      options,
    );
    return all;
  } finally {
    clearInterval(timer);
    process.stderr.write("\r");
  }
}

async function discoverManifestFiles(
  roots,
  filenameSet,
  options,
  counters,
  label = "manifest files",
) {
  const started = nowMs();
  const found = [];
  const timer = setInterval(() => {
    process.stderr.write(
      `\r Searching for ${label}... ${counters.found} found`,
    );
  }, 120);

  const queue = roots.map((r) => path.resolve(r));
  let index = 0;

  try {
    async function worker() {
      while (true) {
        const current = queue[index];
        if (!current) return;
        index += 1;

        let dirents;
        try {
          dirents = await fsp.readdir(current, { withFileTypes: true });
        } catch (error) {
          if (
            error &&
            (error.code === "EACCES" ||
              error.code === "EPERM" ||
              error.code === "ENOENT" ||
              error.code === "ENOTDIR")
          )
            counters.skippedPermissions += 1;
          continue;
        }

        for (const dirent of dirents) {
          const name = dirent.name;
          if (dirent.isDirectory && dirent.isDirectory()) {
            if (!dirent.isSymbolicLink || !dirent.isSymbolicLink()) {
              if (name === "node_modules") continue;
              if (WALK_SKIP_NAMES.has(name)) continue;
              queue.push(path.join(current, name));
            }
          } else if (dirent.isFile && dirent.isFile()) {
            if (
              filenameSet.has(name) ||
              name.endsWith(".csproj") ||
              name.endsWith(".vbproj") ||
              name.endsWith(".fsproj")
            ) {
              found.push(current);
              counters.found += 1;
            }
          }
        }
      }
    }

    await Promise.all(
      Array.from({ length: DISCOVERY_CONCURRENCY }, () => worker()),
    );

    // Deduplicate directories since resolving to directories means multiple matches in one dir create dupes
    // actually, a dir with multiple manifests would be pushed multiple times to found.
    const deduped = Array.from(new Set(found));

    process.stderr.write("\r");
    log(
      "success",
      `Found ${deduped.length} directories containing ${label} in ${hrSeconds(started)}s`,
      options,
    );
    return deduped;
  } finally {
    clearInterval(timer);
    process.stderr.write("\r");
  }
}

module.exports = {
  discoverScanRoots,
  discoverNodeModules,
  discoverManifestFiles,
};
