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

let cachedRgAvailable = null;

async function isRipgrepAvailable() {
  if (cachedRgAvailable !== null) return cachedRgAvailable;
  const result = await runCommand("rg", ["--version"]);
  cachedRgAvailable = result.ok;
  return cachedRgAvailable;
}

async function discoverViaRipgrep(roots, globs, options = {}) {
  const args = ["--files", "--null"];
  for (const g of globs) args.push("-g", g);
  if (options.noIgnore) args.push("--no-ignore");
  if (options.hidden) args.push("--hidden");

  const results = [];
  for (const root of roots) {
    const result = await runCommand("rg", [...args, root], {
      timeoutMs: 60000,
    });
    if (result.ok && result.stdout) {
      const paths = result.stdout
        .split("\0")
        .filter(Boolean)
        .map((p) => (path.isAbsolute(p) ? p : path.join(root, p)));
      results.push(...paths);
    }
  }
  return Array.from(new Set(results));
}
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
        ) {
          counters.skippedPermissions += 1;
        }
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
  const musing = require("../cli/output").musing || { isActive: false };
  const timer = !musing.isActive
    ? setInterval(() => {
        process.stderr.write(
          `\r Searching for node_modules... ${counters.found} found`,
        );
      }, 120)
    : null;

  try {
    if (await isRipgrepAvailable()) {
      const rgResults = await discoverViaRipgrep(
        roots,
        ["**/node_modules/package.json"],
        { noIgnore: true, hidden: true },
      );
      if (rgResults.length > 0) {
        const foundPaths = rgResults.map((p) => path.dirname(p));
        const all = filterNestedNodeModules(foundPaths);
        if (all.length > 0) {
          counters.found = all.length;
          process.stderr.write("\r");
          log(
            "success",
            `Found ${all.length} node_modules directories via ripgrep in ${hrSeconds(started)}s`,
            options,
          );
          return all;
        }
      }
    }

    const nativePerRoot = await asyncPool(
      Math.min(API_CONCURRENCY, Math.max(1, roots.length)),
      roots,
      (root) => discoverNodeModulesViaNative(root),
    );
    const nativeResults = [];
    for (const item of nativePerRoot) {
      if (item && item.ok) nativeResults.push(...item.paths);
    }

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
  const musing = require("../cli/output").musing || { isActive: false };
  const timer = !musing.isActive
    ? setInterval(() => {
        process.stderr.write(
          `\r Searching for ${label}... ${counters.found} found`,
        );
      }, 120)
    : null;

  const queue = roots.map((r) => path.resolve(r));
  let index = 0;

  try {
    if (await isRipgrepAvailable()) {
      const patterns = Array.from(filenameSet);
      patterns.push("*.csproj", "*.vbproj", "*.fsproj");
      const { HASKELL_MANIFEST_NAMES } = require("../config/constants");
      if (filenameSet === HASKELL_MANIFEST_NAMES) {
        patterns.push("*.cabal");
      }
      const globs = patterns.map((p) => `**/${p}`);

      const rgResults = await discoverViaRipgrep(roots, globs);
      if (rgResults.length > 0) {
        const foundDirs = rgResults.map((p) => path.dirname(p));
        const deduped = Array.from(new Set(foundDirs));
        counters.found = rgResults.length;
        process.stderr.write("\r");
        log(
          "success",
          `Found ${deduped.length} directories containing ${label} via ripgrep in ${hrSeconds(started)}s`,
          options,
        );
        return deduped;
      }
    }

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
          ) {
            counters.skippedPermissions += 1;
          }
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
              name.endsWith(".fsproj") ||
              name.endsWith(".cabal")
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

async function discoverDependencyInputs(roots, options) {
  const inputs = [];
  const counters = { found: 0, skippedPermissions: 0 };

  if (options.ecosystems.includes("npm")) {
    const nodeModules = await discoverNodeModules(roots, options, counters);
    for (const nm of nodeModules) {
      const projectRoot = path.dirname(nm);
      inputs.push({ ecosystem: "npm", path: nm, projectRoot, isDir: true });
      const pkgJson = path.join(projectRoot, "package.json");
      const lockJson = path.join(projectRoot, "package-lock.json");
      const shrinkwrap = path.join(projectRoot, "npm-shrinkwrap.json");
      if (fs.existsSync(pkgJson)) {
        inputs.push({
          ecosystem: "npm",
          path: pkgJson,
          projectRoot,
          isDir: false,
        });
      }
      if (fs.existsSync(lockJson)) {
        inputs.push({
          ecosystem: "npm",
          path: lockJson,
          projectRoot,
          isDir: false,
        });
      }
      if (fs.existsSync(shrinkwrap)) {
        inputs.push({
          ecosystem: "npm",
          path: shrinkwrap,
          projectRoot,
          isDir: false,
        });
      }
    }
  }

  const {
    MAVEN_MANIFEST_NAMES,
    GRADLE_BUILD_FILES,
    GRADLE_AUX_FILES,
    NUGET_MANIFEST_NAMES,
    PYTHON_MANIFEST_NAMES,
    GO_MANIFEST_NAMES,
    RUBY_MANIFEST_NAMES,
    RUST_MANIFEST_NAMES,
    PHP_MANIFEST_NAMES,
    DART_MANIFEST_NAMES,
    ELIXIR_MANIFEST_NAMES,
    CONAN_MANIFEST_NAMES,
    HASKELL_MANIFEST_NAMES,
    SWIFT_MANIFEST_NAMES,
    R_MANIFEST_NAMES,
  } = require("../config/constants");

  if (options.ecosystems.includes("maven")) {
    const dirs = await discoverManifestFiles(
      roots,
      MAVEN_MANIFEST_NAMES,
      options,
      counters,
      "Maven projects",
    );
    for (const dir of dirs) {
      for (const name of MAVEN_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "maven",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("gradle")) {
    const dirs = await discoverManifestFiles(
      roots,
      GRADLE_BUILD_FILES,
      options,
      counters,
      "Gradle projects",
    );
    for (const dir of dirs) {
      for (const name of GRADLE_BUILD_FILES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "gradle",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
      for (const name of GRADLE_AUX_FILES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "gradle",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("nuget")) {
    const dirs = await discoverManifestFiles(
      roots,
      NUGET_MANIFEST_NAMES,
      options,
      counters,
      "NuGet projects",
    );
    for (const dir of dirs) {
      // Find all matching manifests in the directory
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (
          NUGET_MANIFEST_NAMES.has(file) ||
          file.endsWith(".csproj") ||
          file.endsWith(".vbproj") ||
          file.endsWith(".fsproj")
        ) {
          inputs.push({
            ecosystem: "nuget",
            path: path.join(dir, file),
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("python")) {
    const dirs = await discoverManifestFiles(
      roots,
      PYTHON_MANIFEST_NAMES,
      options,
      counters,
      "Python projects",
    );
    for (const dir of dirs) {
      for (const name of PYTHON_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "python",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("go")) {
    const dirs = await discoverManifestFiles(
      roots,
      GO_MANIFEST_NAMES,
      options,
      counters,
      "Go projects",
    );
    for (const dir of dirs) {
      for (const name of GO_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "go",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
      const sum = path.join(dir, "go.sum");
      if (fs.existsSync(sum)) {
        inputs.push({
          ecosystem: "go",
          path: sum,
          projectRoot: dir,
          isDir: false,
        });
      }
    }
  }

  if (options.ecosystems.includes("vscode")) {
    // VSCode extensions are just directories with package.json
    // Reuse discoverManifestFiles with package.json
    const dirs = await discoverManifestFiles(
      roots,
      new Set(["package.json"]),
      options,
      counters,
      "VSCode extensions",
    );
    for (const dir of dirs) {
      const p = path.join(dir, "package.json");
      if (fs.existsSync(p)) {
        // Only treat as VSCode if it's not already handled as npm (though they overlap)
        inputs.push({
          ecosystem: "vscode",
          path: p,
          projectRoot: dir,
          isDir: false,
        });
      }
    }
  }

  if (options.ecosystems.includes("ruby")) {
    const dirs = await discoverManifestFiles(
      roots,
      RUBY_MANIFEST_NAMES,
      options,
      counters,
      "Ruby projects",
    );
    for (const dir of dirs) {
      for (const name of RUBY_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "ruby",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("rust")) {
    const dirs = await discoverManifestFiles(
      roots,
      RUST_MANIFEST_NAMES,
      options,
      counters,
      "Rust projects",
    );
    for (const dir of dirs) {
      for (const name of RUST_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "rust",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("php")) {
    const dirs = await discoverManifestFiles(
      roots,
      PHP_MANIFEST_NAMES,
      options,
      counters,
      "PHP projects",
    );
    for (const dir of dirs) {
      for (const name of PHP_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "php",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("dart")) {
    const dirs = await discoverManifestFiles(
      roots,
      DART_MANIFEST_NAMES,
      options,
      counters,
      "Dart projects",
    );
    for (const dir of dirs) {
      for (const name of DART_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "dart",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("elixir")) {
    const dirs = await discoverManifestFiles(
      roots,
      ELIXIR_MANIFEST_NAMES,
      options,
      counters,
      "Elixir projects",
    );
    for (const dir of dirs) {
      for (const name of ELIXIR_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "elixir",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("conan")) {
    const dirs = await discoverManifestFiles(
      roots,
      CONAN_MANIFEST_NAMES,
      options,
      counters,
      "Conan projects",
    );
    for (const dir of dirs) {
      for (const name of CONAN_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "conan",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("haskell")) {
    const dirs = await discoverManifestFiles(
      roots,
      HASKELL_MANIFEST_NAMES,
      options,
      counters,
      "Haskell projects",
    );
    for (const dir of dirs) {
      for (const name of HASKELL_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "haskell",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
      // Also pick up *.cabal files (variable names)
      let cabalEntries;
      try {
        cabalEntries = fs.readdirSync(dir);
      } catch (_) {
        cabalEntries = [];
      }
      for (const file of cabalEntries) {
        if (file.endsWith(".cabal")) {
          const p = path.join(dir, file);
          if (!inputs.some((inp) => inp.path === p)) {
            inputs.push({
              ecosystem: "haskell",
              path: p,
              projectRoot: dir,
              isDir: false,
            });
          }
        }
      }
    }
  }

  if (options.ecosystems.includes("swift")) {
    const dirs = await discoverManifestFiles(
      roots,
      SWIFT_MANIFEST_NAMES,
      options,
      counters,
      "Swift projects",
    );
    for (const dir of dirs) {
      for (const name of SWIFT_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "swift",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  if (options.ecosystems.includes("r")) {
    const dirs = await discoverManifestFiles(
      roots,
      R_MANIFEST_NAMES,
      options,
      counters,
      "R projects",
    );
    for (const dir of dirs) {
      for (const name of R_MANIFEST_NAMES) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) {
          inputs.push({
            ecosystem: "r",
            path: p,
            projectRoot: dir,
            isDir: false,
          });
        }
      }
    }
  }

  return inputs;
}

module.exports = {
  isRipgrepAvailable,
  discoverScanRoots,
  discoverNodeModules,
  discoverManifestFiles,
  discoverDependencyInputs,
};
