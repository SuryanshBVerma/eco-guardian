"use strict";

const path = require("path");
const guardian = require("./eco-guardian");
const { parseGradleLockfile } = require("./src/gradle/parse-lockfile");
const {
  parseGradleBuild: parseGradleBuildDependencies,
} = require("./src/gradle/parse-build");
const { resolveGradlePackages } = require("./src/resolve/gradle");

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
  assert(records[0].group === "org.slf4j", "First package group mismatch");
  assert(records[0].name === "slf4j-api", "First package name mismatch");
  assert(records[0].version === "1.7.25", "First package version mismatch");
  assert(
    records[1].group === "org.apache.commons",
    "Second package group mismatch",
  );
  assert(records[1].name === "commons-lang3", "Second package name mismatch");
  assert(records[1].version === "3.8.1", "Second package version mismatch");
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

  const groovyRecords = parseGradleBuildDependencies(
    groovy,
    "/tmp/project/build.gradle",
  );
  if (groovyRecords.length !== 3) {
    console.log("Groovy records found:", groovyRecords);
  }
  assert(
    groovyRecords.length === 3,
    "Should parse 3 records from Groovy build file",
  );

  assert(
    groovyRecords.some(
      (r) =>
        r.group === "org.slf4j" &&
        r.name === "slf4j-api" &&
        r.version === "1.7.25",
    ),
    "Missing slf4j in Groovy",
  );
  assert(
    groovyRecords.some(
      (r) => r.group === "junit" && r.name === "junit" && r.version === "4.12",
    ),
    "Missing junit in Groovy",
  );
  assert(
    groovyRecords.some(
      (r) =>
        r.group === "org.apache.commons" &&
        r.name === "commons-lang3" &&
        r.version === "3.8.1",
    ),
    "Missing commons-lang3 in Groovy",
  );

  const kotlinRecords = parseGradleBuildDependencies(
    kotlin,
    "/tmp/project/build.gradle.kts",
  );
  assert(
    kotlinRecords.length === 2,
    "Should parse 2 records from Kotlin build file",
  );
}

// Shell-based resolution test removed in favor of test-gradle-static.js

async function testRemediationHint() {
  const { generateRemediationHint } = require("./src/findings/remediation");
  const hint = generateRemediationHint({
    ecosystem: "gradle",
    packageName: "org.slf4j:slf4j-api",
    fixedVersion: "1.7.36",
    foundIn: [{ dependency_type: "direct", manifest_path: "build.gradle" }],
  });
  assert(hint.includes("build.gradle"), "Hint should mention build.gradle");
  assert(hint.includes("1.7.36"), "Hint should include fixed version");
}

async function testGradleFixCommandIsNull() {
  const { buildFixCommand } = require("./src/findings/fix");
  const cmd = buildFixCommand({
    ecosystem: "gradle",
    packageName: "any",
    fixedVersion: "1.0.0",
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
    // testResolveGradlePackages is now covered by test-gradle-static.js

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
