"use strict";

const path = require("path");
const guardian = require("./eco-guardian");
const { 
  parseGradleLockfile, 
  parseGradleBuildDependencies 
} = require("./src/scan/gradle");
const { resolveGradlePackages } = require("./src/resolve/gradle");
const shared = require("./src/resolve/shared");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testParseGradleLockfile() {
  const content = `
# This is a Gradle generated file for dependency locking.
compileClasspath:
org.slf4j:slf4j-api:1.7.25
org.apache.commons:commons-lang3:3.8.1=compileClasspath,runtimeClasspath
`;
  const records = parseGradleLockfile(content, "/tmp/project/gradle.lockfile");
  
  assert(records.length === 2, "Should parse 2 records from lockfile");
  assert(records[0].name === "org.slf4j:slf4j-api", "First package name mismatch");
  assert(records[0].version === "1.7.25", "First package version mismatch");
  assert(records[1].name === "org.apache.commons:commons-lang3", "Second package name mismatch");
  assert(records[1].version === "3.8.1", "Second package version mismatch");
  assert(records[0].osvEcosystem === "Maven", "OSV ecosystem should be Maven");
}

async function testParseGradleBuildDependencies() {
  const groovy = `
dependencies {
    implementation 'org.slf4j:slf4j-api:1.7.25'
    testImplementation "junit:junit:4.12"
    runtimeOnly(group: 'org.apache.commons', name: 'commons-lang3', version: '3.8.1')
}
`;
  const kotlin = `
dependencies {
    implementation("org.slf4j:slf4j-api:1.7.25")
    testImplementation("junit:junit:4.12")
}
`;

  const groovyRecords = parseGradleBuildDependencies(groovy, "/tmp/project/build.gradle");
  assert(groovyRecords.length === 3, "Should parse 3 records from Groovy build file");
  assert(groovyRecords.some(r => r.name === "org.slf4j:slf4j-api" && r.version === "1.7.25"), "Missing slf4j in Groovy");
  assert(groovyRecords.some(r => r.name === "junit:junit" && r.version === "4.12"), "Missing junit in Groovy");
  assert(groovyRecords.some(r => r.name === "org.apache.commons:commons-lang3" && r.version === "3.8.1"), "Missing commons-lang3 in Groovy");

  const kotlinRecords = parseGradleBuildDependencies(kotlin, "/tmp/project/build.gradle.kts");
  assert(kotlinRecords.length === 2, "Should parse 2 records from Kotlin build file");
}

async function testResolveGradlePackages() {
  const originalExec = shared.execAsync;
  const mockOutput = `
runtimeClasspath - Runtime classpath of source set 'main'.
+--- org.slf4j:slf4j-api:1.7.25
\\--- com.google.guava:guava:27.0-jre
     \\--- com.google.guava:failureaccess:1.0 -> 1.0.1
`;

  shared.execAsync = async (cmd) => {
    if (cmd.includes("dependencies")) return mockOutput;
    return "";
  };

  try {
    const packageMap = await resolveGradlePackages(["/tmp/project"], { verbose: false }, {});
    assert(packageMap.size === 3, `Expected 3 unique packages in graph, got ${packageMap.size}`);
    
    const slf4j = packageMap.get("gradle|org.slf4j:slf4j-api|1.7.25");
    assert(slf4j, "slf4j missing from graph");
    assert(slf4j.depth === 1, "slf4j should be direct (depth 1)");

    const failureaccess = packageMap.get("gradle|com.google.guava:failureaccess|1.0.1");
    assert(failureaccess, "failureaccess missing or wrong version from graph (handle transition)");
    assert(failureaccess.depth === 2, "failureaccess should be transitive (depth 2)");
    assert(failureaccess.paths[0] === "/tmp/project", "Path metadata missing");
  } finally {
    shared.execAsync = originalExec;
  }
}

async function testRemediationHint() {
  const { generateRemediationHint } = require("./src/findings/remediation");
  const hint = generateRemediationHint({
    ecosystem: "gradle",
    packageName: "org.slf4j:slf4j-api",
    fixedVersion: "1.7.36",
    foundIn: [{ dependency_type: "direct", manifest_path: "build.gradle" }]
  });
  assert(hint.includes("build.gradle"), "Hint should mention build.gradle");
  assert(hint.includes("1.7.36"), "Hint should include fixed version");
}

async function testGradleFixCommandIsNull() {
  const { buildFixCommand } = require("./src/findings/fix");
  const cmd = buildFixCommand({
    ecosystem: "gradle",
    packageName: "any",
    fixedVersion: "1.0.0"
  });
  assert(cmd === null, "Gradle fix command should be null in v1");
}

async function runAll() {
  console.log("Running Gradle tests...");
  try {
    await testParseGradleLockfile();
    console.log("[PASS] testParseGradleLockfile");
    await testParseGradleBuildDependencies();
    console.log("[PASS] testParseGradleBuildDependencies");
    await testResolveGradlePackages();
    console.log("[PASS] testResolveGradlePackages");
    await testRemediationHint();
    console.log("[PASS] testRemediationHint");
    await testGradleFixCommandIsNull();
    console.log("[PASS] testGradleFixCommandIsNull");
    console.log("All Gradle tests PASSED.");
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
