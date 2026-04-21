"use strict";

const path = require("path");
const fs = require("fs/promises");
const https = require("https");
const { resolveGradleStatic } = require("./src/gradle/resolve-static");
const { parseVersionCatalog } = require("./src/gradle/parse-version-catalog");
const { parseGradleSettings } = require("./src/gradle/parse-settings");
const {
  isResolvableVersion,
  parsePomDependencies,
  parseModuleDependencies,
} = require("./src/gradle/fetch-metadata");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testParseVersionCatalog() {
  const content = `
[versions]
slf4j = "1.7.36"
junit = "5.8.2"

[libraries]
slf4j-api = { group = "org.slf4j", name = "slf4j-api", version.ref = "slf4j" }
guava = "com.google.guava:guava:31.1-jre"
`;
  const result = parseVersionCatalog(content);
  assert(
    result.libraries["slf4j-api"].version === "1.7.36",
    "Should resolve slf4j version reference",
  );
  assert(
    result.libraries["guava"].group === "com.google.guava",
    "Should parse literal library string",
  );
}

async function testMetadataVersionFiltering() {
  assert(isResolvableVersion("1.2.3"), "Concrete versions should resolve");
  assert(!isResolvableVersion("[1.0,2.0)"), "Version ranges should be skipped");
  assert(
    !isResolvableVersion("RELEASE"),
    "RELEASE pseudo-version should be skipped",
  );
  assert(
    !isResolvableVersion("${libVersion}"),
    "Property versions should be skipped",
  );

  const pom = `
<dependencies>
  <dependency>
    <groupId>org.good</groupId>
    <artifactId>good-lib</artifactId>
    <version>1.0.0</version>
  </dependency>
  <dependency>
    <groupId>org.bad</groupId>
    <artifactId>range-lib</artifactId>
    <version>[1.0,2.0)</version>
  </dependency>
  <dependency>
    <groupId>org.bad</groupId>
    <artifactId>release-lib</artifactId>
    <version>RELEASE</version>
  </dependency>
</dependencies>
`;
  const pomDeps = parsePomDependencies(pom);
  assert(pomDeps.length === 1, "POM parser should keep only concrete versions");
  assert(
    pomDeps[0].group === "org.good",
    "POM parser should keep the valid dependency",
  );

  const moduleJson = JSON.stringify({
    variants: [
      {
        name: "runtimeElements",
        dependencies: [
          {
            group: "org.good",
            module: "good-module",
            version: { requires: "2.1.0" },
          },
          { group: "org.bad", module: "bad-module", version: {} },
          {
            group: "org.bad",
            module: "bad-range",
            version: { requires: "[1.0,2.0)" },
          },
        ],
      },
    ],
  });
  const moduleDeps = parseModuleDependencies(moduleJson);
  assert(
    moduleDeps.length === 1,
    "Module parser should keep only concrete versions",
  );
  assert(
    moduleDeps[0].name === "good-module",
    "Module parser should keep the valid dependency",
  );
}

async function testParseGradleSettings() {
  const content = `
rootProject.name = 'my-cool-project'
include 'app', 'core:api', 'core:impl'
`;
  const result = parseGradleSettings(content, "settings.gradle");
  assert(
    result.rootProjectName === "my-cool-project",
    "Should parse root project name",
  );
  assert(result.subprojects.includes("app"), "Should find app subproject");
  assert(
    result.subprojects.includes("core/api"),
    "Should normalize colon paths",
  );
}

async function testStaticResolutionMetadata() {
  // Mock fs and https
  const originalReadFile = fs.readFile;
  const originalReaddir = fs.readdir;
  const originalGet = https.get;

  const projectRoot = "/test-project";

  const files = {
    [path.join(projectRoot, "build.gradle")]: `
      dependencies {
        implementation 'org.slf4j:slf4j-api:1.7.36'
      }
    `,
  };

  const httpMocks = {
    "https://repo1.maven.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.module":
      JSON.stringify({
        variants: [
          {
            name: "runtimeElements",
            dependencies: [
              {
                group: "org.slf4j",
                module: "slf4j-parent",
                version: { requires: "1.7.36" },
              },
            ],
          },
        ],
      }),
    "https://repo1.maven.org/maven2/org/slf4j/slf4j-parent/1.7.36/slf4j-parent-1.7.36.module":
      JSON.stringify({
        variants: [],
      }),
  };

  fs.readdir = async (dir, opts) => {
    const list = [{ name: "build.gradle", isDirectory: () => false }];
    if (dir === projectRoot) {
      return opts && opts.withFileTypes ? list : list.map((e) => e.name);
    }
    return [];
  };

  fs.readFile = async (file) => {
    if (files[file]) return files[file];
    throw new Error(`File not found: ${file}`);
  };

  https.get = (url, cb) => {
    const res = {
      statusCode: 200,
      on: (event, handler) => {
        if (event === "data") handler(httpMocks[url] || "{}");
        if (event === "end") handler();
      },
    };
    cb(res);
    return { on: () => {} };
  };

  try {
    const result = await resolveGradleStatic(
      [projectRoot],
      { graphResolution: true, verbose: false },
      {},
    );
    assert(
      result.packageMap.size === 2,
      `Expected 2 packages, got ${result.packageMap.size}`,
    );

    const api = result.packageMap.get("gradle|org.slf4j:slf4j-api|1.7.36");
    assert(api, "slf4j-api missing");
    assert(api.depth === 1, "slf4j-api should be direct");

    const parent = result.packageMap.get(
      "gradle|org.slf4j:slf4j-parent|1.7.36",
    );
    assert(parent, "slf4j-parent transitive missing");
    assert(parent.depth === 2, "slf4j-parent should be transitive");
  } finally {
    fs.readFile = originalReadFile;
    fs.readdir = originalReaddir;
    https.get = originalGet;
  }
}

async function testSkipsUnresolvableTransitivesFromPomFallback() {
  const originalReadFile = fs.readFile;
  const originalReaddir = fs.readdir;
  const originalGet = https.get;

  const projectRoot = "/test-project-pom";
  const files = {
    [path.join(projectRoot, "build.gradle")]: `
      dependencies {
        implementation 'org.example:demo:1.0.0'
      }
    `,
  };

  const pomPayload = `
<dependencies>
  <dependency>
    <groupId>org.ok</groupId>
    <artifactId>ok-lib</artifactId>
    <version>2.0.0</version>
  </dependency>
  <dependency>
    <groupId>org.bad</groupId>
    <artifactId>range-lib</artifactId>
    <version>[1.0,2.0)</version>
  </dependency>
  <dependency>
    <groupId>org.bad</groupId>
    <artifactId>release-lib</artifactId>
    <version>RELEASE</version>
  </dependency>
</dependencies>
`;

  fs.readdir = async (dir, opts) => {
    if (dir === projectRoot) {
      const list = [{ name: "build.gradle", isDirectory: () => false }];
      return opts && opts.withFileTypes ? list : list.map((e) => e.name);
    }
    return [];
  };

  fs.readFile = async (file) => {
    if (files[file]) return files[file];
    throw new Error(`File not found: ${file}`);
  };

  https.get = (url, cb) => {
    const moduleUrl =
      "https://repo1.maven.org/maven2/org/example/demo/1.0.0/demo-1.0.0.module";
    const pomUrl =
      "https://repo1.maven.org/maven2/org/example/demo/1.0.0/demo-1.0.0.pom";
    const okLibUrl =
      "https://repo1.maven.org/maven2/org/ok/ok-lib/2.0.0/ok-lib-2.0.0.module";

    let statusCode = 404;
    let body = "";
    if (url === moduleUrl) {
      statusCode = 404;
    } else if (url === pomUrl) {
      statusCode = 200;
      body = pomPayload;
    } else if (url === okLibUrl) {
      statusCode = 200;
      body = JSON.stringify({ variants: [] });
    }

    const res = {
      statusCode,
      on: (event, handler) => {
        if (event === "data" && body) handler(body);
        if (event === "end") handler();
      },
    };
    cb(res);
    return { on: () => {} };
  };

  try {
    const result = await resolveGradleStatic(
      [projectRoot],
      { graphResolution: true, verbose: false },
      {},
    );

    assert(
      result.packageMap.has("gradle|org.example:demo|1.0.0"),
      "Direct dependency should exist",
    );
    assert(
      result.packageMap.has("gradle|org.ok:ok-lib|2.0.0"),
      "Concrete transitive dependency should exist",
    );
    assert(
      !result.packageMap.has("gradle|org.bad:range-lib|[1.0,2.0)"),
      "Range transitive dependency should be skipped",
    );
    assert(
      !result.packageMap.has("gradle|org.bad:release-lib|RELEASE"),
      "RELEASE transitive dependency should be skipped",
    );
  } finally {
    fs.readFile = originalReadFile;
    fs.readdir = originalReaddir;
    https.get = originalGet;
  }
}

async function testVerboseWarningAggregation() {
  const originalReadFile = fs.readFile;
  const originalReaddir = fs.readdir;
  const originalGet = https.get;
  const originalStderrWrite = process.stderr.write;

  const projectRoot = "/test-project-warnings";
  const deps = Array.from(
    { length: 25 },
    (_, i) => `implementation 'org.warn:lib-${i + 1}:1.0.0'`,
  ).join("\n");
  const files = {
    [path.join(projectRoot, "build.gradle")]: `dependencies { ${deps} }`,
  };

  let stderrBuffer = "";
  process.stderr.write = (chunk, encoding, callback) => {
    stderrBuffer += String(chunk);
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  fs.readdir = async (dir, opts) => {
    if (dir === projectRoot) {
      const list = [{ name: "build.gradle", isDirectory: () => false }];
      return opts && opts.withFileTypes ? list : list.map((e) => e.name);
    }
    return [];
  };

  fs.readFile = async (file) => {
    if (files[file]) return files[file];
    throw new Error(`File not found: ${file}`);
  };

  https.get = (url, cb) => {
    const res = {
      statusCode: 404,
      on: (event, handler) => {
        if (event === "end") handler();
      },
    };
    cb(res);
    return { on: () => {} };
  };

  try {
    await resolveGradleStatic(
      [projectRoot],
      { graphResolution: true, verbose: true },
      {},
    );
    const warnings = (
      stderrBuffer.match(/Transitive metadata unavailable/g) || []
    ).length;
    assert(warnings <= 20, "Verbose warning count should be capped");
    assert(
      stderrBuffer.includes("Gradle metadata resolution summary"),
      "Summary line should be printed in verbose mode",
    );
    assert(
      stderrBuffer.includes("not-found="),
      "Summary line should include not-found count",
    );
  } finally {
    fs.readFile = originalReadFile;
    fs.readdir = originalReaddir;
    https.get = originalGet;
    process.stderr.write = originalStderrWrite;
  }
}

async function runAll() {
  console.log("Running Static Gradle Resolver tests...");
  try {
    await testParseVersionCatalog();
    console.log("[PASS] testParseVersionCatalog");
    await testParseGradleSettings();
    console.log("[PASS] testParseGradleSettings");
    await testMetadataVersionFiltering();
    console.log("[PASS] testMetadataVersionFiltering");
    await testStaticResolutionMetadata();
    console.log("[PASS] testStaticResolutionMetadata");
    await testSkipsUnresolvableTransitivesFromPomFallback();
    console.log("[PASS] testSkipsUnresolvableTransitivesFromPomFallback");
    await testVerboseWarningAggregation();
    console.log("[PASS] testVerboseWarningAggregation");
    console.log("All Static Gradle tests PASSED.");
  } catch (err) {
    console.error("[FAIL]", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  runAll();
}

module.exports = { runAll };
