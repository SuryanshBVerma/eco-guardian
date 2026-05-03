"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const fs = require("fs/promises");
const https = require("https");
const { resolveNpmPackages } = require("./src/resolve/npm");
const { resolveMavenPackages } = require("./src/resolve/maven");
const { resolveNuGetPackages } = require("./src/resolve/nuget");
const { resolveGoPackages } = require("./src/resolve/go");
const { resolvePythonPackages } = require("./src/resolve/python");
const { resolveGradlePackages } = require("./src/resolve/gradle");
const { resolveEcosystemPackages } = require("./src/resolve/index");

// Mock shared execAsync
const shared = require("./src/resolve/shared");
const originalExec = shared.execAsync;

async function testNpmResolver() {
  const jsonContent = JSON.stringify({
    dependencies: {
      axios: {
        version: "1.0.0",
        dependencies: { "follow-redirects": { version: "1.15.0" } },
      },
    },
  });
  // Mock the function AND its usage in the module
  require("./src/resolve/shared").execAsync = async () => jsonContent;

  const map = await resolveNpmPackages(["/root"], { verbose: true }, {});
  if (!map.has("npm|axios|1.0.0")) {
    console.log("JSON Content:", jsonContent);
    console.log("Map keys found:", Array.from(map.keys()));
  }
  assert(map.has("npm|axios|1.0.0"), "npm resolver should find axios");
  assert(map.get("npm|axios|1.0.0").depth === 1, "axios depth should be 1");
  assert(
    map.has("npm|follow-redirects|1.15.0"),
    "npm resolver should find transitives",
  );
  assert(
    map.get("npm|follow-redirects|1.15.0").depth === 2,
    "transitive depth should be 2",
  );
  assert(
    map
      .get("npm|follow-redirects|1.15.0")
      .resolved_path.includes("axios@1.0.0"),
    "path should include parent",
  );
}

async function testMavenResolver() {
  require("./src/resolve/shared").execAsync = async () => `
[INFO] com.example:my-app:jar:1.0.0
[INFO] +- org.slf4j:slf4j-api:jar:1.7.36:compile
[INFO] |  \\- org.slf4j:slf4j-parent:jar:1.7.36:compile
[INFO] \\- com.google.guava:guava:jar:33.0.0-jre:compile
  `;

  const map = await resolveMavenPackages(["/root"], { verbose: true }, {});
  assert(
    map.has("maven|org.slf4j:slf4j-api|1.7.36"),
    "maven resolver should find slf4j-api",
  );
  assert(
    map.get("maven|org.slf4j:slf4j-api|1.7.36").depth === 1,
    "slf4j-api depth should be 1",
  );
  assert(
    map.get("maven|org.slf4j:slf4j-parent|1.7.36").depth === 2,
    "slf4j-parent depth should be 2",
  );
}

async function testNuGetResolver() {
  require("./src/resolve/shared").execAsync = async () =>
    JSON.stringify({
      projects: [
        {
          path: "C:\\proj\\test.csproj",
          frameworks: [
            {
              topLevelPackages: [
                { id: "Newtonsoft.Json", resolvedVersion: "13.0.3" },
              ],
              transitivePackages: [
                { id: "Some.Transitive", resolvedVersion: "1.0.0" },
              ],
            },
          ],
        },
      ],
    });

  const map = await resolveNuGetPackages(["/root"], { verbose: false }, {});
  assert(
    map.has("nuget|Newtonsoft.Json|13.0.3"),
    "nuget resolver should find Newtonsoft.Json",
  );
  assert(
    map.get("nuget|Some.Transitive|1.0.0").resolution_mode === "graph",
    "nuget should be in graph mode",
  );
}

async function testGoResolver() {
  // go list -m -json all returns objects separated by newline } newline
  let callCount = 0;
  // go list -m -json all returns objects separated by newline } newline
  require("./src/resolve/shared").execAsync = async (cmd) => {
    if (cmd.includes("go mod graph")) {
      return "my-app github.com/gin-gonic/gin@v1.9.1\ngithub.com/gin-gonic/gin@v1.9.1 github.com/go-playground/validator/v10@v10.14.0";
    }
    return (
      JSON.stringify({ Path: "my-app", Main: true }) +
      "\n}\n" +
      JSON.stringify({ Path: "github.com/gin-gonic/gin", Version: "v1.9.1" }) +
      "\n}\n" +
      JSON.stringify({
        Path: "github.com/go-playground/validator/v10",
        Version: "v10.14.0",
      })
    );
  };

  const map = await resolveGoPackages(["/root"], { verbose: false }, {});
  assert(
    map.has("go|github.com/gin-gonic/gin|v1.9.1"),
    "go resolver should find gin",
  );
  assert(
    map.has("go|github.com/go-playground/validator/v10|v10.14.0"),
    "go resolver should find transitives",
  );
  assert(
    map.get("go|github.com/go-playground/validator/v10|v10.14.0").depth === 2,
    "go transitive depth check",
  );
}

async function testPythonResolver() {
  require("./src/resolve/shared").execAsync = async () =>
    JSON.stringify({
      installed: [{ metadata: { name: "requests", version: "2.31.0" } }],
    });

  const map = await resolvePythonPackages(["/root"], { verbose: false }, {});
  assert(
    map.has("python|requests|2.31.0"),
    "python resolver should find requests",
  );
  assert(
    map.get("python|requests|2.31.0").resolution_mode === "installed",
    "python mode should be installed",
  );
}

async function testGradleResolver() {
  const projectRoot = path.resolve("/root");
  const originalReadFile = fs.readFile;
  const originalReaddir = fs.readdir;
  const originalGet = https.get;

  const files = {
    [path.join(projectRoot, "build.gradle")]: `
      dependencies {
        implementation 'org.slf4j:slf4j-api:1.7.25'
        implementation 'com.google.guava:guava:27.0-jre'
      }
    `,
  };

  const httpMocks = {
    "https://repo1.maven.org/maven2/org/slf4j/slf4j-api/1.7.25/slf4j-api-1.7.25.module":
      JSON.stringify({ variants: [] }),
    "https://repo1.maven.org/maven2/com/google/guava/guava/27.0-jre/guava-27.0-jre.module":
      JSON.stringify({
        variants: [
          {
            name: "runtimeElements",
            dependencies: [
              {
                group: "com.google.guava",
                module: "failureaccess",
                version: { requires: "1.0.1" },
              },
            ],
          },
        ],
      }),
    "https://repo1.maven.org/maven2/com/google/guava/failureaccess/1.0.1/failureaccess-1.0.1.module":
      JSON.stringify({ variants: [] }),
  };

  fs.readdir = async (dir, opts) => {
    if (dir === projectRoot) {
      if (opts && opts.withFileTypes) {
        return [{ name: "build.gradle", isDirectory: () => false }];
      }
      return ["build.gradle"];
    }
    return [];
  };

  fs.readFile = async (file) => {
    if (files[file]) return files[file];
    throw new Error(`File not found: ${file}`);
  };

  https.get = (url, cb) => {
    const payload = httpMocks[url];
    const res = {
      statusCode: payload ? 200 : 404,
      on: (event, handler) => {
        if (event === "data" && payload) handler(payload);
        if (event === "end") handler();
      },
    };
    cb(res);
    return { on: () => {} };
  };

  try {
    const map = await resolveGradlePackages(
      [projectRoot],
      { verbose: false, graphResolution: true },
      {},
    );
    assert(
      map.has("gradle|org.slf4j:slf4j-api|1.7.25"),
      "gradle resolver should find slf4j-api",
    );
    assert(
      map.get("gradle|org.slf4j:slf4j-api|1.7.25").depth === 1,
      "slf4j-api depth should be 1",
    );
    assert(
      map.has("gradle|com.google.guava:failureaccess|1.0.1"),
      "gradle resolver should find transitioned version",
    );
    assert(
      map.get("gradle|com.google.guava:failureaccess|1.0.1").depth === 2,
      "failureaccess depth should be 2",
    );
  } finally {
    fs.readFile = originalReadFile;
    fs.readdir = originalReaddir;
    https.get = originalGet;
  }
}

async function testResolveEcosystemFallback() {
  // Test 1: unsupported ecosystem (n/a)
  const res1 = await resolveEcosystemPackages(
    "vscode",
    ["/root"],
    { verbose: false },
    {},
  );
  assert(res1.usedFallback === false, "vscode n/a is not a fallback case");
  assert(res1.mode === "n/a", "vscode mode should be n/a");

  // Test 2: resolver failure
  require("./src/resolve/shared").execAsync = async () => {
    throw new Error("tool missing");
  };
  const res2 = await resolveEcosystemPackages(
    "npm",
    ["/root"],
    { verbose: false },
    {},
  );
  assert(res2.usedFallback === true, "failure should signal fallback");
  assert(
    res2.mode === "inventory-fallback",
    "mode should be inventory-fallback",
  );
  assert(res2.packageMap.size === 0, "packageMap should be empty on failure");

  // Test 3: empty results
  require("./src/resolve/shared").execAsync = async () =>
    JSON.stringify({ dependencies: {} });
  const res3 = await resolveEcosystemPackages(
    "npm",
    ["/root"],
    { verbose: false },
    {},
  );
  assert(res3.usedFallback === true, "empty results should signal fallback");
  assert(
    res3.mode === "inventory-fallback",
    "mode should be inventory-fallback",
  );
}

test("npm resolver", testNpmResolver);
test("maven resolver", testMavenResolver);
test("nuget resolver", testNuGetResolver);
test("go resolver", testGoResolver);
test("python resolver", testPythonResolver);
test("gradle resolver", testGradleResolver);
test("resolver fallback logic", testResolveEcosystemFallback);
