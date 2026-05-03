"use strict";

const { test } = require("node:test");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const assert = require("assert");

const {
  parseRequirementsTxt,
  parsePipfileLock,
  parsePoetryLock,
} = require("./src/scan/python");
const { parseGoMod } = require("./src/scan/go");
const { parsePomDependencies } = require("./src/scan/maven");
const {
  parsePackagesConfig,
  parseProjectPackageReferences,
} = require("./src/scan/nuget");
const { parseGradleBuild } = require("./src/gradle/parse-build");
const { parseGradleLockfile } = require("./src/gradle/parse-lockfile");
const { resolveSarifLocation } = require("./src/report/location");
const {
  getFindingConfidence,
  formatFindingProvenance,
} = require("./src/report/common");
const { writeCsvReport } = require("./src/report/csv");
const { writeSarifReport } = require("./src/report/sarif");

async function readFixture(relPath) {
  const filePath = path.join(__dirname, "fixtures", relPath);
  return fs.readFile(filePath, "utf8");
}

async function withTempDir(fn) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eco-guardian-fixtures-"),
  );
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function testPythonParsers() {
  const reqPath = path.join(
    __dirname,
    "fixtures",
    "python",
    "requirements-direct",
    "requirements.txt",
  );
  const req = await readFixture(
    path.join("python", "requirements-direct", "requirements.txt"),
  );
  const reqRecords = parseRequirementsTxt(req, reqPath);
  assert(reqRecords.length === 2, "requirements.txt should parse 2 records");
  assert(
    reqRecords[0].occurrences[0].line === 1,
    "requirements line should be 1",
  );

  const pipPath = path.join(
    __dirname,
    "fixtures",
    "python",
    "pipfile-lock",
    "Pipfile.lock",
  );
  const pip = await readFixture(
    path.join("python", "pipfile-lock", "Pipfile.lock"),
  );
  const pipRecords = parsePipfileLock(pip, pipPath);
  assert(pipRecords.length === 2, "Pipfile.lock should parse 2 records");

  const poetryPath = path.join(
    __dirname,
    "fixtures",
    "python",
    "poetry-lock",
    "poetry.lock",
  );
  const poetry = await readFixture(
    path.join("python", "poetry-lock", "poetry.lock"),
  );
  const poetryRecords = parsePoetryLock(poetry, poetryPath);
  assert(poetryRecords.length === 2, "poetry.lock should parse 2 records");
}

async function testGoParser() {
  const goPath = path.join(
    __dirname,
    "fixtures",
    "go",
    "gomod-direct",
    "go.mod",
  );
  const goMod = await readFixture(path.join("go", "gomod-direct", "go.mod"));
  const records = parseGoMod(goMod, goPath);
  assert(records.length === 2, "go.mod should parse 2 records");
  assert(records[0].occurrences[0].line >= 1, "go.mod line should be set");
}

async function testMavenParser() {
  const pomPath = path.join(
    __dirname,
    "fixtures",
    "maven",
    "pom-direct",
    "pom.xml",
  );
  const pom = await readFixture(path.join("maven", "pom-direct", "pom.xml"));
  const records = parsePomDependencies(pom, pomPath);
  assert(records.length === 1, "pom.xml should parse 1 record");
}

async function testNuGetParsers() {
  const pkgPath = path.join(
    __dirname,
    "fixtures",
    "nuget",
    "packages-config",
    "packages.config",
  );
  const pkg = await readFixture(
    path.join("nuget", "packages-config", "packages.config"),
  );
  const pkgRecords = parsePackagesConfig(pkg, pkgPath);
  assert(pkgRecords.length === 1, "packages.config should parse 1 record");

  const csprojPath = path.join(
    __dirname,
    "fixtures",
    "nuget",
    "csproj-package-reference",
    "app.csproj",
  );
  const csproj = await readFixture(
    path.join("nuget", "csproj-package-reference", "app.csproj"),
  );
  const csprojRecords = parseProjectPackageReferences(csproj, csprojPath);
  assert(csprojRecords.length === 1, "csproj should parse 1 record");
}

async function testGradleParsers() {
  const buildPath = path.join(
    __dirname,
    "fixtures",
    "gradle",
    "build-gradle-direct",
    "build.gradle",
  );
  const build = await readFixture(
    path.join("gradle", "build-gradle-direct", "build.gradle"),
  );
  const buildRecords = parseGradleBuild(build, buildPath);
  assert(buildRecords.length === 3, "build.gradle should parse 3 records");
  assert(buildRecords[0].line >= 1, "build.gradle line should be set");

  const lockPath = path.join(
    __dirname,
    "fixtures",
    "gradle",
    "lockfile-direct",
    "gradle.lockfile",
  );
  const lock = await readFixture(
    path.join("gradle", "lockfile-direct", "gradle.lockfile"),
  );
  const lockRecords = parseGradleLockfile(lock, lockPath);
  assert(lockRecords.length === 2, "gradle.lockfile should parse 2 records");
  assert(lockRecords[0].line >= 1, "gradle.lockfile line should be set");
}

async function testSarifLocationResolver() {
  const manifestPath = path.join(
    __dirname,
    "fixtures",
    "gradle",
    "build-gradle-direct",
    "build.gradle",
  );
  const finding = {
    package: "org.slf4j:slf4j-api",
    version: "1.7.36",
  };
  const loc = { manifest_path: manifestPath };
  const region = await resolveSarifLocation(loc, finding);
  assert(region.startLine === 2, "SARIF resolver should find line 2");
}

async function testConfidenceHelpers() {
  const osv = { source: "osv" };
  const nvd = { source: "nvd", match_confidence: "medium" };
  assert(getFindingConfidence(osv) === "high", "OSV confidence should be high");
  assert(
    getFindingConfidence(nvd) === "medium",
    "NVD confidence should be medium",
  );
  assert(
    formatFindingProvenance(osv).includes("confidence"),
    "Provenance should include confidence",
  );
}

async function testCsvAndSarifOutputs() {
  await withTempDir(async (root) => {
    const csvPath = path.join(root, "report.csv");
    const sarifPath = path.join(root, "report.sarif");
    const findings = [
      {
        ecosystem: "npm",
        package: "left-pad",
        version: "1.0.0",
        advisory_id: "OSV-TEST",
        severity: "high",
        source: "osv",
        found_in: [],
        resolution_mode: "inventory",
      },
    ];

    await writeCsvReport(findings, { exportCsv: csvPath });
    const csv = await fs.readFile(csvPath, "utf8");
    assert(
      csv.split("\n")[0].includes("source") &&
        csv.split("\n")[0].includes("confidence"),
      "CSV header should include source and confidence",
    );

    await writeSarifReport(
      findings,
      1,
      { exportSarif: sarifPath, path: root },
      [],
      0,
      null,
      null,
    );
    const sarif = JSON.parse(await fs.readFile(sarifPath, "utf8"));
    const props = sarif.runs[0].results[0].properties;
    assert(props.match_confidence, "SARIF should include match_confidence");
    assert(props.resolution_mode, "SARIF should include resolution_mode");
  });
}

const tests = [
  ["pythonParsers", testPythonParsers],
  ["goParser", testGoParser],
  ["mavenParser", testMavenParser],
  ["nugetParsers", testNuGetParsers],
  ["gradleParsers", testGradleParsers],
  ["sarifLocationResolver", testSarifLocationResolver],
  ["confidenceHelpers", testConfidenceHelpers],
  ["csvAndSarifOutputs", testCsvAndSarifOutputs],
];

for (const [name, fn] of tests) {
  test(name, fn);
}
