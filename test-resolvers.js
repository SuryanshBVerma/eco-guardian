"use strict";

const path = require("path");
const { resolveNpmPackages } = require("./src/resolve/npm");
const { resolveMavenPackages } = require("./src/resolve/maven");
const { resolveNuGetPackages } = require("./src/resolve/nuget");
const { resolveGoPackages } = require("./src/resolve/go");
const { resolvePythonPackages } = require("./src/resolve/python");
const { resolveGradlePackages } = require("./src/resolve/gradle");
const { resolveEcosystemPackages } = require("./src/resolve/index");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
  require("./src/resolve/shared").execAsync = async () => `
runtimeClasspath - Runtime classpath of source set 'main'.
+--- org.slf4j:slf4j-api:1.7.25
\\--- com.google.guava:guava:27.0-jre
     \\--- com.google.guava:failureaccess:1.0 -> 1.0.1
  `;

  const map = await resolveGradlePackages(["/root"], { verbose: false }, {});
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

async function run() {
  try {
    process.stdout.write("Running resolver parser tests...\n");
    await testNpmResolver();
    process.stdout.write("✓ npm resolver\n");
    await testMavenResolver();
    process.stdout.write("✓ maven resolver\n");
    await testNuGetResolver();
    process.stdout.write("✓ nuget resolver\n");
    await testGoResolver();
    process.stdout.write("✓ go resolver\n");
    await testPythonResolver();
    process.stdout.write("✓ python resolver\n");
    await testGradleResolver();
    process.stdout.write("✓ gradle resolver\n");
    await testResolveEcosystemFallback();
    process.stdout.write("✓ resolver fallback logic\n");
    process.stdout.write("\nAll resolver tests passed\n");
  } finally {
    shared.execAsync = originalExec;
  }
}

run().catch((err) => {
  process.stderr.write(`✗ Resolver test failure: ${err.message}\n`);
  process.exit(1);
});
