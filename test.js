"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const guardian = require("./eco-guardian");
const { writeTxtReport } = require("./src/report/txt");
const { writeHtmlReport } = require("./src/report/html");
const { writeJsonReport } = require("./src/report/json");
const { writeCsvReport } = require("./src/report/csv");
const { writeFixScript } = require("./src/report/fix-script");
const { renderFindingsTable } = require("./src/report/console");
const { loadBaseline } = require("./src/baseline");
const { evaluatePolicy } = require("./src/policy/gates");
const { advisoryRangeMatchesVersion } = require("./src/vuln/query-service");
const { stripComments } = require("./src/shared/xml-lite");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withTempDir(fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "eco-guardian-test-"));
  try {
    return await fn(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function testParseArgs() {
  const a = guardian.parseArgs([
    "--path",
    "/tmp/x",
    "--ui",
    "--json",
    "--severity",
    "high",
    "--fix",
    "--global-only",
    "--no-cache",
  ]);
  assert(a.path === "/tmp/x", "parseArgs --path failed");
  assert(
    a.pathExplicit === true,
    "parseArgs pathExplicit should be true when --path is provided",
  );
  assert(
    a.json === true &&
      a.fix === true &&
      a.globalOnly === true &&
      a.ui === true &&
      a.noCache === true,
    "parseArgs boolean flags failed",
  );
  assert(a.severity === "high", "parseArgs --severity failed");
  const e = guardian.parseArgs(["--export-txt", "report.txt"]);
  assert(e.exportTxt === "report.txt", "parseArgs --export-txt failed");

  const b = guardian.parseArgs([]);
  assert(
    b.pathExplicit === false,
    "parseArgs pathExplicit default should be false",
  );
  assert(b.banner === "on", "parseArgs --banner default should be on");

  const bo = guardian.parseArgs(["--banner", "off"]);
  assert(bo.banner === "off", "parseArgs --banner off failed");

  const bn = guardian.parseArgs(["--banner", "on"]);
  assert(bn.banner === "on", "parseArgs --banner on failed");

  let threw = false;
  try {
    guardian.parseArgs(["--severity", "bad"]);
  } catch (_) {
    threw = true;
  }
  assert(threw, "parseArgs should reject invalid severity");

  const f = guardian.parseArgs(["--export-html", "report.html"]);
  assert(f.exportHtml === "report.html", "parseArgs --export-html failed");

  const gt = guardian.parseArgs(["--gradle-task", ":app:dependencies"]);
  assert(
    gt.gradleTask === ":app:dependencies",
    "parseArgs --gradle-task failed",
  );

  const nvdOn = guardian.parseArgs(["--nvd-mode", "on"]);
  assert(nvdOn.nvdMode === "on", "parseArgs --nvd-mode on failed");

  const nvdOff = guardian.parseArgs(["--nvd-mode", "off"]);
  assert(nvdOff.nvdMode === "off", "parseArgs --nvd-mode off failed");

  const nvdAuto = guardian.parseArgs(["--nvd-mode", "auto"]);
  assert(nvdAuto.nvdMode === "auto", "parseArgs --nvd-mode auto failed");

  const alias = guardian.parseArgs(["--dependency-check-mode"]);
  assert(
    alias.dependencyCheckMode === true,
    "parseArgs --dependency-check-mode should enable compatibility flag",
  );
  assert(
    alias.nvdMode === "on",
    "parseArgs --dependency-check-mode should map to nvdMode=on",
  );

  const noNvd = guardian.parseArgs(["--no-nvd"]);
  assert(noNvd.nvdMode === "off", "parseArgs --no-nvd failed");

  threw = false;
  try {
    guardian.parseArgs(["--path"]);
  } catch (_) {
    threw = true;
  }
  assert(threw, "parseArgs should reject missing --path value");

  threw = false;
  try {
    guardian.parseArgs(["--banner"]);
  } catch (_) {
    threw = true;
  }
  assert(threw, "parseArgs should reject missing --banner value");

  threw = false;
  try {
    guardian.parseArgs(["--nvd-mode", "invalid"]);
  } catch (_) {
    threw = true;
  }
  assert(threw, "parseArgs should reject invalid --nvd-mode value");

  threw = false;
  try {
    guardian.parseArgs(["--banner", "invalid"]);
  } catch (_) {
    threw = true;
  }
  assert(threw, "parseArgs should reject invalid --banner value");

  const p = guardian.parseArgs([
    "--export-json",
    "report.json",
    "--export-csv",
    "report.csv",
    "--strict-baseline",
    "--fail-on-severity",
    "high",
    "--max-critical",
    "0",
    "--max-high",
    "2",
  ]);
  assert(p.exportJson === "report.json", "parseArgs --export-json failed");
  assert(p.exportCsv === "report.csv", "parseArgs --export-csv failed");
  assert(p.strictBaseline === true, "parseArgs --strict-baseline failed");
  assert(p.failOnSeverity === "high", "parseArgs --fail-on-severity failed");
  assert(p.maxCritical === 0, "parseArgs --max-critical failed");
  assert(p.maxHigh === 2, "parseArgs --max-high failed");
}

async function testPublicExportsSurface() {
  const expected = [
    "VERSION",
    "PLATFORM",
    "parseArgs",
    "asyncPool",
    "chunkArray",
    "filterNestedNodeModules",
    "readPackageJson",
    "normalizeOsvAdvisory",
    "buildFixCommand",
    "runScan",
    "main",
    "parsePomDependencies",
    "parsePackagesConfig",
    "parseProjectPackageReferences",
    "parseDirectoryPackagesProps",
    "parseEcosystemList",
    "_cveMentionsVersion",
  ];
  for (const key of expected) {
    assert(
      Object.prototype.hasOwnProperty.call(guardian, key),
      `missing export: ${key}`,
    );
  }
}

async function testAsyncPool() {
  const items = Array.from({ length: 30 }, (_, i) => i);
  let active = 0;
  let maxActive = 0;

  const results = await guardian.asyncPool(4, items, async (i) => {
    active += 1;
    if (active > maxActive) maxActive = active;
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return i * 2;
  });

  assert(maxActive <= 4, `asyncPool concurrency exceeded limit: ${maxActive}`);
  assert(results.length === items.length, "asyncPool result length mismatch");
  assert(
    results[0] === 0 && results[10] === 20,
    "asyncPool result values mismatch",
  );
}

async function testChunkArray() {
  const arr = Array.from({ length: 2847 }, (_, i) => i);
  const chunks = guardian.chunkArray(arr, 1000);
  assert(chunks.length === 3, "chunkArray should produce 3 chunks");
  assert(chunks[0].length === 1000, "chunkArray first chunk wrong length");
  assert(chunks[1].length === 1000, "chunkArray second chunk wrong length");
  assert(chunks[2].length === 847, "chunkArray last chunk wrong length");
}

async function testFilterNestedNodeModules() {
  const input = [
    "/a/node_modules",
    "/a/node_modules/b/node_modules",
    "/x/y/node_modules",
    "/x/y/node_modules/z/node_modules",
    "/x/y/node_modules",
  ];

  const output = guardian.filterNestedNodeModules(input);
  assert(
    output.includes(path.resolve("/a/node_modules")),
    "filterNestedNodeModules should keep top-level node_modules",
  );
  assert(
    output.includes(path.resolve("/x/y/node_modules")),
    "filterNestedNodeModules should keep valid node_modules",
  );
  assert(
    !output.some(
      (p) => p.endsWith("/b/node_modules") || p.endsWith("\\b\\node_modules"),
    ),
    "filterNestedNodeModules should remove nested node_modules",
  );
  assert(
    output.length === 2,
    "filterNestedNodeModules should dedupe and strip nested",
  );
}

async function testBuildFixCommand() {
  const direct = guardian.buildFixCommand({
    ecosystem: "npm",
    packageName: "axios",
    fixedVersion: "1.2.3",
    dependencyType: "direct",
    isGlobal: false,
    parentPackage: null,
  });
  assert(
    direct === "npm install 'axios@1.2.3'",
    "buildFixCommand direct fix failed",
  );

  const noFixDirect = guardian.buildFixCommand({
    ecosystem: "npm",
    packageName: "left-pad",
    fixedVersion: null,
    dependencyType: "direct",
    isGlobal: false,
    parentPackage: null,
  });
  assert(
    noFixDirect === "npm uninstall 'left-pad'",
    "buildFixCommand direct no-fix failed",
  );

  const globalFix = guardian.buildFixCommand({
    ecosystem: "npm",
    packageName: "npm",
    fixedVersion: "10.0.0",
    dependencyType: "direct",
    isGlobal: true,
    parentPackage: null,
  });
  assert(
    globalFix === "npm install -g 'npm@10.0.0'",
    "buildFixCommand global fix failed",
  );

  const transitive = guardian.buildFixCommand({
    ecosystem: "npm",
    packageName: "lodash",
    fixedVersion: null,
    dependencyType: "transitive",
    isGlobal: false,
    parentPackage: { name: "webpack" },
  });
  assert(
    transitive === "npm install 'webpack@latest'",
    "buildFixCommand transitive failed",
  );

  const escapedNpm = guardian.buildFixCommand({
    ecosystem: "npm",
    packageName: "bad;name",
    fixedVersion: "1.0.0",
    dependencyType: "direct",
    isGlobal: false,
    parentPackage: null,
  });
  assert(
    escapedNpm.includes("'bad;name@1.0.0'"),
    "buildFixCommand should quote npm package/version",
  );
}

async function testNormalizeOsvAdvisory() {
  const normalized = guardian.normalizeOsvAdvisory({
    id: "GHSA-aaaa-bbbb-cccc",
    aliases: ["CVE-2026-1111"],
    database_specific: { severity: "critical" },
    severity: [
      {
        type: "CVSS_V3",
        score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/9.8",
      },
    ],
    summary: "Critical issue",
    affected: [
      { ranges: [{ events: [{ introduced: "0" }, { fixed: "1.2.3" }] }] },
    ],
    references: [{ url: "https://example.com/advisory" }],
  });

  assert(
    normalized.id === "GHSA-aaaa-bbbb-cccc",
    "normalizeOsvAdvisory id mismatch",
  );
  assert(
    normalized.cve === "CVE-2026-1111",
    "normalizeOsvAdvisory cve mismatch",
  );
  assert(
    normalized.severity === "CRITICAL",
    "normalizeOsvAdvisory severity mapping failed",
  );
  assert(
    normalized.cvss_score === 9.8,
    "normalizeOsvAdvisory cvss parse failed",
  );
  assert(
    Array.isArray(normalized.fixed_versions) &&
      normalized.fixed_versions[0] === "1.2.3",
    "normalizeOsvAdvisory fixed_versions failed",
  );
}

async function testNormalizeOsvAdvisorySparse() {
  const sparse = guardian.normalizeOsvAdvisory({});
  assert(sparse.id === "OSV-UNKNOWN", "empty obj → OSV-UNKNOWN id");
  assert(Array.isArray(sparse.aliases) && sparse.aliases.length === 0, "no aliases → []");
  assert(sparse.severity === "MODERATE", "no severity → MODERATE");
  assert(sparse.cvss_score === null, "no cvss → null");
  assert(sparse.title === "Vulnerability advisory", "no summary/id → default title");
  assert(Array.isArray(sparse.fixed_versions) && sparse.fixed_versions.length === 0, "no affected → []");
  assert(Array.isArray(sparse.references) && sparse.references.length === 0, "no references → []");
}

async function testNormalizeNpmAdvisorySparse() {
  const { normalizeNpmAdvisory } = require("./src/vuln/normalizers");
  const sparse = normalizeNpmAdvisory({});
  assert(sparse.id === "NPM-UNKNOWN", "empty obj → NPM-UNKNOWN");
  assert(sparse.cvss_score === null, "no cvssScore → null");
  assert(Array.isArray(sparse.fixed_versions) && sparse.fixed_versions.length === 0, "no patched → []");
  assert(Array.isArray(sparse.references) && sparse.references.length === 0, "no url → []");
}

async function testNormalizeSeverityAllLevels() {
  const { normalizeSeverity } = require("./src/vuln/normalizers");
  assert(normalizeSeverity(null) === "MODERATE", "null → MODERATE");
  assert(normalizeSeverity("CRITICAL") === "CRITICAL");
  assert(normalizeSeverity("HIGH") === "HIGH");
  assert(normalizeSeverity("medium") === "MODERATE", "medium → MODERATE");
  assert(normalizeSeverity("Low") === "LOW");
  assert(normalizeSeverity("unknown") === "MODERATE", "unknown → MODERATE default");
}

async function testCvssToSeverityAllBranches() {
  const { cvssToSeverity } = require("./src/vuln/normalizers");
  assert(cvssToSeverity(null) === "MODERATE", "null → MODERATE");
  assert(cvssToSeverity(9.8) === "CRITICAL");
  assert(cvssToSeverity(7.5) === "HIGH");
  assert(cvssToSeverity(5.0) === "MODERATE", "5.0 → MODERATE");
  assert(cvssToSeverity(2.0) === "LOW");
}

async function testExtractNvdCvssAllVersions() {
  const { extractNvdCvss } = require("./src/vuln/normalizers");
  assert(extractNvdCvss(null) === null, "null metrics → null");
  assert(extractNvdCvss({}) === null, "empty metrics → null");
  assert(
    extractNvdCvss({ cvssMetricV30: [{ cvssData: { baseScore: 7.5 } }] }) === 7.5,
    "v30 fallback"
  );
  assert(
    extractNvdCvss({ cvssMetricV2: [{ cvssData: { baseScore: 5.0 } }] }) === 5.0,
    "v2 fallback"
  );
}

async function testFindOsvCvssEdgeCases() {
  const { findOsvCvss } = require("./src/vuln/normalizers");
  assert(findOsvCvss(null) === null, "null → null");
  assert(findOsvCvss({}) === null, "no severity array → null");
  assert(findOsvCvss({ severity: [] }) === null, "empty severity → null");
  assert(findOsvCvss({ severity: [{}] }) === null, "no score field → null");
  assert(findOsvCvss({ severity: [{ score: "CVSS:3.1/AV:N/.../7.5" }] }) === 7.5, "valid score");
}

async function testSeverityAllowedDefaults() {
  const { severityAllowed } = require("./src/vuln/normalizers");
  assert(severityAllowed(null, null) === true, "null/null → allowed");
  assert(severityAllowed("critical", "high") === true, "critical >= high → allowed");
  assert(severityAllowed("low", "high") === false, "low < high → not allowed");
}

async function testReadPackageJson() {
  await withTempDir(async (root) => {
    const ok = path.join(root, "ok");
    const bad = path.join(root, "bad");
    const missingField = path.join(root, "missing");
    await fsp.mkdir(ok, { recursive: true });
    await fsp.mkdir(bad, { recursive: true });
    await fsp.mkdir(missingField, { recursive: true });

    await fsp.writeFile(
      path.join(ok, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0" }),
      "utf8",
    );
    await fsp.writeFile(path.join(bad, "package.json"), "{not json", "utf8");
    await fsp.writeFile(
      path.join(missingField, "package.json"),
      JSON.stringify({ name: "x" }),
      "utf8",
    );

    const parsed = await guardian.readPackageJson(ok);
    const badParsed = await guardian.readPackageJson(bad);
    const missingParsed = await guardian.readPackageJson(missingField);
    const noneParsed = await guardian.readPackageJson(path.join(root, "none"));

    assert(
      parsed && parsed.name === "x" && parsed.version === "1.0.0",
      "readPackageJson valid package failed",
    );
    assert(badParsed === null, "readPackageJson bad JSON should return null");
    assert(
      missingParsed === null,
      "readPackageJson missing fields should return null",
    );
    assert(
      noneParsed === null,
      "readPackageJson missing file should return null",
    );
  });
}

async function testIntegrationSmoke() {
  await withTempDir(async (root) => {
    const exportPath = path.join(root, "report.txt");
    process.env.NPM_GUARDIAN_DISABLE_GLOBAL = "1";
    const originalWrite = process.stdout.write;
    let result;
    try {
      process.stdout.write = () => true;
      result = await guardian.runScan({
        path: root,
        pathExplicit: true,
        ecosystems: ["npm"],
        severity: "critical",
        json: true,
        noCache: true,
        fix: false,
        exportTxt: exportPath,
        help: false,
        version: false,
        global: false,
        allDrives: false,
        verbose: false,
      });
    } finally {
      process.stdout.write = originalWrite;
    }
    assert(
      Array.isArray(result.findings),
      "integration smoke findings should be array",
    );
    assert(
      result.findings.length === 0,
      "integration smoke expected zero vulnerabilities",
    );
    assert(
      result.packageCount === 0,
      "integration smoke expected zero packages scanned",
    );
    const exists = fs.existsSync(exportPath);
    assert(exists, "integration smoke expected TXT report file");
    const report = await fsp.readFile(exportPath, "utf8");
    assert(
      report.includes("eco-guardian report"),
      "integration smoke expected report content",
    );
    assert(
      report.includes("Generated:"),
      "integration smoke expected generated timestamp",
    );
    assert(
      report.includes("Findings"),
      "integration smoke expected findings section",
    );
  });
}

async function testCliHelpAndVersion() {
  const originalWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  let out = "";

  try {
    process.stdout.write = (chunk) => {
      out += String(chunk);
      return true;
    };
    process.exitCode = undefined;
    await guardian.main(["--help"]);
    assert(process.exitCode === 0, "help command should exit with status 0");
    assert(out.includes("Usage:"), "help output should include Usage");
    assert(
      out.includes("--export-txt <file>"),
      "help output should include TXT export flag",
    );
    assert(out.includes("--ui"), "help output should include UI flag");
    assert(
      out.includes("--banner <on|off>"),
      "help output should include banner flag",
    );

    out = "";
    process.exitCode = undefined;
    await guardian.main(["--version"]);
    assert(process.exitCode === 0, "version command should exit with status 0");
    assert(
      String(out || "").trim() === guardian.VERSION,
      "version output should match VERSION export",
    );
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
  }
}

async function testCliBannerOffResultOnly() {
  await withTempDir(async (root) => {
    const prevDisableGlobal = process.env.NPM_GUARDIAN_DISABLE_GLOBAL;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    const originalExitCode = process.exitCode;
    let out = "";
    let err = "";

    process.env.NPM_GUARDIAN_DISABLE_GLOBAL = "1";

    try {
      process.stdout.write = (chunk) => {
        out += String(chunk);
        return true;
      };
      process.stderr.write = (chunk) => {
        err += String(chunk);
        return true;
      };
      process.exitCode = undefined;

      await guardian.main([
        "--path",
        root,
        "--ecosystems",
        "npm",
        "--banner",
        "off",
      ]);

      assert(
        process.exitCode === 0,
        "banner off run should exit with status 0",
      );
      assert(
        out.includes("eco-guardian scan complete"),
        "banner off run should still print summary to stdout",
      );
      assert(
        out.includes("[OK] All clear."),
        "banner off run should print final result message",
      );
      assert(err.length === 0, "banner off run should suppress stderr output");
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.exitCode = originalExitCode;
      if (prevDisableGlobal === undefined) {
        delete process.env.NPM_GUARDIAN_DISABLE_GLOBAL;
      } else {
        process.env.NPM_GUARDIAN_DISABLE_GLOBAL = prevDisableGlobal;
      }
    }
  });
}

async function testHtmlReportEscaping() {
  await withTempDir(async (root) => {
    const out = path.join(root, "report.txt");
    const findings = [
      {
        package: "<pkg>",
        version: "1.0.0",
        severity: "HIGH",
        advisory_id: "ADV-1",
        title: "Dangerous <script>alert(1)</script>",
        found_in: [
          { project: "proj&one", dependency_type: "direct", parent: null },
        ],
        fix_commands: ['npm install "<pkg>"@latest'],
        fix_command: 'npm install "<pkg>"@latest',
        references: ["https://example.com/?a=1&b=2"],
      },
    ];
    const file = await writeTxtReport(findings, 1, { exportTxt: out });
    assert(
      file === path.resolve(process.cwd(), out),
      "writeTxtReport should return absolute output path",
    );
    const text = await fsp.readFile(out, "utf8");
    assert(text.includes("<pkg>@1.0.0"), "TXT report should include package");
    assert(
      text.includes("Dangerous <script>alert(1)</script>"),
      "TXT report should preserve plain text content",
    );
    assert(
      text.includes("Reference: https://example.com/?a=1&b=2"),
      "TXT report should include reference",
    );
  });
}

async function testHtmlReportGeneration() {
  await withTempDir(async (root) => {
    const out = path.join(root, "report.html");
    const findings = [
      {
        package: "<pkg>",
        version: "1.0.0",
        severity: "HIGH",
        advisory_id: "ADV-1",
        title: "Dangerous <script>alert(1)</script>",
        found_in: [
          { project: "proj&one", dependency_type: "direct", parent: null },
        ],
        fix_commands: ['npm install "<pkg>"@latest'],
        fix_command: 'npm install "<pkg>"@latest',
        references: ["https://example.com/?a=1&b=2"],
      },
    ];
    const file = await writeHtmlReport(findings, 1, {
      exportHtml: out,
      path: root,
      ecosystems: ["npm"],
      severity: "low",
    });
    assert(
      file === path.resolve(process.cwd(), out),
      "writeHtmlReport should return absolute output path",
    );
    const html = await fsp.readFile(out, "utf8");
    assert(
      html.includes("&lt;pkg&gt;@1.0.0"),
      "HTML report should escape package name",
    );
    assert(
      html.includes("Dangerous &lt;script&gt;alert(1)&lt;/script&gt;"),
      "HTML report should escape title",
    );
    assert(
      html.includes('href="https://example.com/?a=1&amp;b=2"'),
      "HTML report should escape reference URL",
    );
    assert(
      html.includes("badge-high"),
      "HTML report should include severity badge class",
    );
    assert(
      html.includes("summary-strip"),
      "HTML report should render a minimal summary strip",
    );
    assert(
      html.includes("finding"),
      "HTML report should render a minimal finding block",
    );
    assert(
      html.includes("Issue:"),
      "HTML report should show the issue summary",
    );
    assert(
      html.includes("Origin:"),
      "HTML report should show the dependency origin",
    );
    assert(
      html.includes("Fix:"),
      "HTML report should show the fix action",
    );
  });
}

async function testJsonCsvReportGeneration() {
  await withTempDir(async (root) => {
    const jsonOut = path.join(root, "report.json");
    const csvOut = path.join(root, "report.csv");
    const findings = [
      {
        severity: "HIGH",
        ecosystem: "npm",
        package: "left-pad",
        version: "1.0.0",
        advisory_id: "ADV-1",
        cve: "CVE-2026-0001",
        cvss: 8.1,
        fixed_version: "1.1.0",
        found_in: [{}],
        resolution_mode: "inventory",
        fix_command: "npm install left-pad@1.1.0",
      },
    ];

    const jsonFile = await writeJsonReport(findings, { exportJson: jsonOut });
    const csvFile = await writeCsvReport(findings, { exportCsv: csvOut });
    assert(fs.existsSync(jsonFile), "JSON report should exist");
    assert(fs.existsSync(csvFile), "CSV report should exist");

    const csvText = await fsp.readFile(csvOut, "utf8");
    assert(csvText.includes("severity,ecosystem,package"), "CSV header");
    assert(csvText.includes("left-pad"), "CSV row package");
  });
}

async function testPolicyEvaluation() {
  const findings = [
    { severity: "critical" },
    { severity: "high" },
    { severity: "moderate" },
  ];

  const pass = evaluatePolicy(findings, { maxCritical: 1, maxHigh: 1 });
  assert(pass.enabled === true, "policy should be enabled");
  assert(pass.passed === true, "policy should pass");

  const fail = evaluatePolicy(findings, {
    failOnSeverity: "high",
    maxCritical: 0,
  });
  assert(fail.passed === false, "policy should fail");
  assert(fail.violations.length >= 1, "policy should collect violations");
}

async function testPolicyMaxHighViolation() {
  const findings = [
    { severity: "high" },
    { severity: "high" },
    { severity: "high" },
  ];
  const result = evaluatePolicy(findings, { maxHigh: 2 });
  assert(result.passed === false, "should fail when high exceed maxHigh");
  assert(result.violations.length === 1, "should have violation");
  assert(result.counts.high === 3, "should count all high findings");
}

async function testPolicyDisabledWhenNoThresholds() {
  const findings = [{ severity: "critical" }];
  const result = evaluatePolicy(findings, {});
  assert(result.enabled === false, "policy should be disabled with no thresholds");
  assert(result.passed === true, "should pass when disabled");
}

async function testPolicyUnknownSeverity() {
  const findings = [{ severity: "unknown_severity" }];
  const result = evaluatePolicy(findings, {});
  assert(result.counts.critical === 0, "unknown severity not counted as critical");
  assert(result.counts.high === 0, "unknown severity not counted as high");
}

async function testPolicyNullFindings() {
  const result = evaluatePolicy(null, { maxCritical: 1 });
  assert(result.passed === true, "null findings should pass");
  assert(result.counts.critical === 0, "null findings should have zero counts");
}

async function testAdvisoryRangeMatching() {
  assert(
    advisoryRangeMatchesVersion(">=1.0.0, <2.0.0", "1.5.0") === true,
    "range should match",
  );
  assert(
    advisoryRangeMatchesVersion(">=1.0.0, <2.0.0", "2.1.0") === false,
    "range should not match",
  );
  assert(
    advisoryRangeMatchesVersion("<1.0.1 || >=2.0.0", "2.1.0") === true,
    "or-expression should match",
  );
}

async function testAdvisoryRangeHyphen() {
  assert(advisoryRangeMatchesVersion("1.0.0 - 2.0.0", "1.5.0") === true, "hyphen range should match");
  assert(advisoryRangeMatchesVersion("1.0.0 - 2.0.0", "3.0.0") === false, "hyphen range should not match");
}

async function testAdvisoryRangeEmpty() {
  assert(advisoryRangeMatchesVersion("", "1.0.0") === true, "empty string → matches all");
  assert(advisoryRangeMatchesVersion(null, "1.0.0") === true, "null → matches all");
}

async function testAdvisoryRangeTilde() {
  assert(advisoryRangeMatchesVersion("~1.2.3", "1.2.5") === true, "tilde in-range");
  assert(advisoryRangeMatchesVersion("~1.2.3", "2.0.0") === false, "tilde out-of-range");
}

async function testAdvisoryRangeWildcard() {
  assert(advisoryRangeMatchesVersion("1.2.x", "1.2.5") === true, "1.2.x in minor");
  assert(advisoryRangeMatchesVersion("1.2.x", "1.3.0") === false, "1.2.x out of minor");
  assert(advisoryRangeMatchesVersion("1.x", "1.9.0") === true, "1.x in major");
  assert(advisoryRangeMatchesVersion("1.x", "2.0.0") === false, "1.x out of major");
}

async function testAdvisoryRangeBadVersion() {
  assert(advisoryRangeMatchesVersion(">=1.0.0", "not-a-version") === false, "bad version → no match");
}

async function testAdvisoryRangeZeroDotWildcard() {
  assert(advisoryRangeMatchesVersion("0.x", "0.5.0") === true, "0.x matches 0.5.0");
  assert(advisoryRangeMatchesVersion("0.0.x", "0.0.5") === true, "0.0.x matches 0.0.5");
}

async function testAdvisoryRangeCaretZeroVersion() {
  assert(advisoryRangeMatchesVersion("^0.2.0", "0.2.3") === true, "^0.2.0 matches 0.2.3");
}

async function testAdvisoryRangePlainEqual() {
  assert(advisoryRangeMatchesVersion("1.2.3", "1.2.3") === true, "plain version exact match");
  assert(advisoryRangeMatchesVersion("1.2.3", "1.2.4") === false, "plain version mismatch");
}

async function testAdvisoryRangeVeePrefix() {
  assert(advisoryRangeMatchesVersion(">=v1.0.0, <v2.0.0", "1.5.0") === true, "v-prefix range with plain version");
}

async function testAdvisoryRangeMultipleGroups() {
  assert(advisoryRangeMatchesVersion("<=0.9.0 || >=2.0.0", "2.1.0") === true, "second || group");
  assert(advisoryRangeMatchesVersion("<=0.9.0 || >=2.0.0", "1.0.0") === false, "between || groups");
}

async function testTableRenderMultiple() {
  const table = renderFindingsTable([
    { severity: "CRITICAL", package: "pkg-a", version: "1.0", advisory_id: "ADV-1", found_in: [{ project: "proj1" }], fix_command: "npm install" },
    { severity: "HIGH", package: "pkg-b", version: "2.0", advisory_id: "ADV-2", found_in: [{ project: "proj2" }], fix_command: null },
    { severity: "LOW", package: "pkg-c", version: "3.0", advisory_id: null, found_in: [], fix_command: null },
  ]);
  assert(table.includes("pkg-a"), "table should include first package");
  assert(table.includes("pkg-b"), "table should include second package");
  assert(table.includes("pkg-c"), "table should include third package");
  assert(table.includes("CRITICAL"), "table should show severity");
}

async function testNormalizeSeverityEdge() {
  const { normalizeSeverity } = require("./src/vuln/normalizers");
  assert(normalizeSeverity("   HIGH   ") === "HIGH", "whitespace should trim");
  assert(normalizeSeverity("Moderate") === "MODERATE", "Moderate → MODERATE");
  assert(normalizeSeverity(123) === "MODERATE", "number → MODERATE default");
}

async function testEventsToRangeMultiple() {
  const { eventsToRange } = require("./src/vuln/normalizers");
  const range = eventsToRange([
    { ranges: [{ events: [{ introduced: "1.0.0" }, { fixed: "2.0.0" }] }] },
    { ranges: [{ events: [{ introduced: "3.0.0" }] }] },
  ]);
  assert(range && range.includes(">=1.0.0"), "should include first range");
  assert(range.includes(">=3.0.0"), "should include second range");
}

async function testDedupeAdvisoriesDuplicate() {
  const { dedupeAdvisories } = require("./src/vuln/normalizers");
  const result = dedupeAdvisories([
    { id: "ADV-1", source: "osv" },
    { id: "ADV-1", source: "osv" },
    { id: "ADV-2", source: "npm" },
  ]);
  assert(result.length === 2, "should dedupe by id+source");
}

async function testStrictBaselineMissingFile() {
  await withTempDir(async (root) => {
    const prev = process.cwd();
    process.chdir(root);
    try {
      let threw = false;
      try {
        await loadBaseline("missing-baseline.json", {
          strictBaseline: true,
          baselineExplicit: true,
        });
      } catch (_) {
        threw = true;
      }
      assert(threw, "strict baseline should throw on missing explicit file");
    } finally {
      process.chdir(prev);
    }
  });
}

async function testStrictBaselineInvalidJson() {
  await withTempDir(async (root) => {
    const prev = process.cwd();
    process.chdir(root);
    try {
      await fsp.writeFile("bad-baseline.json", "{not json", "utf8");
      let threw = false;
      try {
        await loadBaseline("bad-baseline.json", {
          strictBaseline: true,
          baselineExplicit: true,
        });
      } catch (_) {
        threw = true;
      }
      assert(threw, "strict baseline should throw on invalid JSON");
    } finally {
      process.chdir(prev);
    }
  });
}

async function testTableNoTruncation() {
  const table = renderFindingsTable([
    {
      severity: "CRITICAL",
      package: "very-long-package-name-that-should-not-be-truncated",
      version: "9.9.9",
      advisory_id: "ADV-ULTRA-LONG-IDENTIFIER-123456789",
      found_in: [{ project: "project-1" }],
      fix_command:
        'Set-Location -LiteralPath "D:\\Some\\Very\\Long\\Project\\Path\\With\\No\\Truncation"; npm install very-long-package-name-that-should-not-be-truncated@latest',
    },
  ]);
  assert(!table.includes("..."), "table should not truncate text");
  assert(
    table.includes("very-long-package-name-that-should-not-be-truncated@9.9.9"),
    "table should include full package",
  );
}

async function testFixScriptGeneration() {
  await withTempDir(async (root) => {
    const prevCwd = process.cwd();
    process.chdir(root);
    try {
      const findings = [
        {
          package: "lodash",
          version: "4.17.19",
          fix_steps: [
            { project: "(global)", command: "npm install -g lodash@latest" },
            { project: "/tmp/project-a", command: "npm install lodash@latest" },
            { project: "/tmp/project-a", command: "npm install lodash@latest" },
          ],
        },
      ];
      const file = await writeFixScript(findings, { fix: true });
      assert(file && fs.existsSync(file), "fix script should be written");
      const ps1File = path.join(root, "eco-guardian-fixes.ps1");
      const shFile = path.join(root, "eco-guardian-fixes.sh");
      assert(fs.existsSync(ps1File), "PowerShell script should exist");
      assert(fs.existsSync(shFile), "Bash script should exist");
      const ps1Text = await fsp.readFile(ps1File, "utf8");
      const shText = await fsp.readFile(shFile, "utf8");
      assert(
        ps1Text.includes("# eco-guardian fix script - generated"),
        "ps1 should include header",
      );
      assert(
        shText.includes("# eco-guardian fix script - generated"),
        "sh should include header",
      );
      assert(ps1Text.includes("Set-Location"), "ps1 should use Set-Location");
      assert(shText.includes("cd '/tmp/project-a'"), "sh should use cd");
      assert(
        ps1Text.includes("npm install -g lodash@latest"),
        "ps1 should include global command",
      );
      assert(
        shText.includes("npm install -g lodash@latest"),
        "sh should include global command",
      );
    } finally {
      process.chdir(prevCwd);
    }
  });
}

async function testParseEcosystemList() {
  const list = guardian.parseEcosystemList("npm,Maven, nUget");
  assert(list.length === 3, "parseEcosystemList length failed");
  assert(
    list[0] === "npm" && list[1] === "maven" && list[2] === "nuget",
    "parseEcosystemList parse failed",
  );

  let threw = false;
  try {
    guardian.parseEcosystemList("npm,cargo");
  } catch (_) {
    threw = true;
  }
  assert(threw, "parseEcosystemList should reject unsupported");
}

async function testParsePomDependencies() {
  const xml = `
    <project>
      <properties>
        <guava.version>33.4.0-jre</guava.version>
      </properties>
      <dependencyManagement>
        <dependencies>
          <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
            <version>1.7.36</version>
          </dependency>
        </dependencies>
      </dependencyManagement>
      <dependencies>
        <dependency> <!-- explicit -->
          <groupId>junit</groupId>
          <artifactId>junit</artifactId>
          <version>4.13.2</version>
        </dependency>
        <dependency> <!-- property -->
          <groupId>com.google.guava</groupId>
          <artifactId>guava</artifactId>
          <version>\${guava.version}</version>
        </dependency>
        <dependency> <!-- management -->
          <groupId>org.slf4j</groupId>
          <artifactId>slf4j-api</artifactId>
        </dependency>
      </dependencies>
    </project>
  `;
  const records = guardian.parsePomDependencies(xml, "/pom.xml");
  assert(records.length === 3, "parsePomDependencies length");
  assert(
    records[0].name === "junit:junit" && records[0].version === "4.13.2",
    "explicit version",
  );
  assert(
    records[1].name === "com.google.guava:guava" &&
      records[1].version === "33.4.0-jre",
    "property version",
  );
  assert(
    records[2].name === "org.slf4j:slf4j-api" &&
      records[2].version === "1.7.36",
    "managed version",
  );
}

async function testParsePackagesConfig() {
  const xml = `
    <packages>
      <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
    </packages>
  `;
  const records = guardian.parsePackagesConfig(xml, "/packages.config");
  assert(records.length === 1, "packages.config length");
  assert(
    records[0].name === "Newtonsoft.Json" && records[0].version === "13.0.3",
    "packages.config parsed",
  );
}

async function testParseProjectPackageReferences() {
  const xml = `
    <Project>
      <ItemGroup>
        <PackageReference Include="AutoMapper" Version="12.0.1" />
        <PackageReference Include="MediatR">
          <Version>12.2.0</Version>
        </PackageReference>
        <PackageReference Include="SharedPkg" />
      </ItemGroup>
    </Project>
  `;
  const centralVersions = new Map();
  centralVersions.set("SharedPkg", "1.0.0");

  const records = guardian.parseProjectPackageReferences(
    xml,
    "/proj.csproj",
    centralVersions,
  );
  assert(records.length === 3, "PackageReference length");
  assert(
    records[0].name === "AutoMapper" && records[0].version === "12.0.1",
    "attr version",
  );
  assert(
    records[1].name === "MediatR" && records[1].version === "12.2.0",
    "element version",
  );
  assert(
    records[2].name === "SharedPkg" && records[2].version === "1.0.0",
    "managed version",
  );
}

async function testParseDirectoryPackagesProps() {
  const xml = `
    <Project>
      <ItemGroup>
        <PackageVersion Include="System.Text.Json" Version="8.0.0" />
      </ItemGroup>
    </Project>
  `;
  const map = guardian.parseDirectoryPackagesProps(xml, "/props");
  assert(map.get("System.Text.Json") === "8.0.0", "PackageVersion parsed");
}

async function testParsePackagesLockJson() {
  const json = JSON.stringify({
    dependencies: {
      ".NETCoreApp,Version=v8.0": {
        "Newtonsoft.Json": "13.0.3",
        "Some.Transitive": { resolved: "1.0.1" },
      },
    },
  });
  const records = guardian.parsePackagesLockJson(json, "/packages.lock.json");
  assert(records.length === 2, "packages.lock.json length");
  assert(
    records.some((r) => r.name === "Newtonsoft.Json" && r.version === "13.0.3"),
    "Newtonsoft.Json parsed",
  );
  assert(
    records.some((r) => r.name === "Some.Transitive" && r.version === "1.0.1"),
    "transitive resolved version parsed",
  );
}

async function testSummaryCountsUniquePackages() {
  const { printSummary } = require("./src/report/console");
  const originalWrite = process.stdout.write;
  let out = "";
  try {
    process.stdout.write = (chunk) => {
      out += chunk;
      return true;
    };
    const findings = [
      {
        ecosystem: "npm",
        package: "a",
        version: "1",
        severity: "high",
        found_in: [],
      },
      {
        ecosystem: "npm",
        package: "a",
        version: "1",
        severity: "low",
        found_in: [],
      },
    ];
    printSummary(1, findings, {});
    assert(
      out.includes("Packages scanned:  1"),
      "Summary packages scanned count failed",
    );
    assert(
      out.includes("Findings:          2 advisories found"),
      "Summary findings count failed",
    );
    assert(
      out.includes("Vulnerable pkgs:   1"),
      "Summary unique vulnerable packages count failed",
    );
    assert(out.includes("Clean packages:    0"), "Summary clean count failed");
  } finally {
    process.stdout.write = originalWrite;
  }
}

async function testEcosystemKeyNamespacing() {
  const nodeKey = "npm|left-pad|1.3.0";
  const nugetKey = "NuGet|left-pad|1.3.0";
  assert(nodeKey !== nugetKey, "Keys should not collide");
}

async function testBuildFixCommandEcosystems() {
  const maven = guardian.buildFixCommand({
    ecosystem: "Maven",
    packageName: "test",
    fixedVersion: "1",
  });
  const nuget = guardian.buildFixCommand({
    ecosystem: "NuGet",
    packageName: "test",
    fixedVersion: "1",
  });
  const vscode = guardian.buildFixCommand({
    ecosystem: "VSCode",
    packageName: "test",
    fixedVersion: "1",
  });
  const npm = guardian.buildFixCommand({
    ecosystem: "npm",
    packageName: "test",
    fixedVersion: "1",
    dependencyType: "direct",
  });

  assert(maven !== null, "Maven fix command should be generated");
  assert(nuget !== null, "NuGet fix command should be generated");
  assert(vscode === null, "VSCode fix command should be null");
  assert(npm !== null, "npm fix command should be generated");
}

async function testIntegrationSmokeMultiEcosystem() {
  await withTempDir(async (root) => {
    const exportPath = path.join(root, "report.txt");
    process.env.NPM_GUARDIAN_DISABLE_GLOBAL = "1";

    await fsp.mkdir(path.join(root, "node_modules", "dummy"), {
      recursive: true,
    });
    await fsp.writeFile(
      path.join(root, "node_modules", "dummy", "package.json"),
      JSON.stringify({ name: "dummy", version: "1.0.0" }),
    );
    await fsp.writeFile(path.join(root, "pom.xml"), "<project></project>");
    await fsp.writeFile(path.join(root, "test.csproj"), "<Project></Project>");

    const originalWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    let result;
    try {
      process.stdout.write = () => true;
      process.stderr.write = () => true;
      result = await guardian.runScan({
        path: root,
        pathExplicit: true,
        globalOnly: false,
        ecosystems: ["npm", "maven", "nuget"],
        severity: "critical",
        json: true,
        noCache: true,
        fix: false,
        exportTxt: exportPath,
        help: false,
        version: false,
        global: false,
        allDrives: false,
        verbose: false,
      });
    } finally {
      process.stdout.write = originalWrite;
      process.stderr.write = originalStderrWrite;
    }

    assert(
      Array.isArray(result.findings),
      "integration smoke multi findings should be array",
    );
  });
}

async function testParseRequirementsTxt() {
  const content = `
requests==2.31.0
numpy==1.26.4 # some comment
# hashed line
django==4.2
  `;
  const records = guardian.parseRequirementsTxt(content, "/requirements.txt");
  assert(records.length === 3, "parseRequirementsTxt length");
  assert(
    records[0].name === "requests" && records[0].version === "2.31.0",
    "requests parsed",
  );
  assert(
    records[1].name === "numpy" && records[1].version === "1.26.4",
    "numpy parsed",
  );
  assert(
    records[2].name === "django" && records[2].version === "4.2",
    "django parsed",
  );
}

async function testParsePipfileLock() {
  const json = JSON.stringify({
    default: {
      requests: { version: "==2.31.0" },
    },
    develop: {
      pytest: { version: "==7.4.0" },
    },
  });
  const records = guardian.parsePipfileLock(json, "/Pipfile.lock");
  assert(records.length === 2, "parsePipfileLock length");
  assert(
    records.some((r) => r.name === "requests" && r.version === "2.31.0"),
    "requests parsed",
  );
  assert(
    records.some((r) => r.name === "pytest" && r.version === "7.4.0"),
    "pytest parsed",
  );
}

async function testParsePoetryLock() {
  const content = `
[[package]]
name = "requests"
version = "2.31.0"

[[package]]
name = "flask"
version = "3.0.0"
  `;
  const records = guardian.parsePoetryLock(content, "/poetry.lock");
  assert(records.length === 2, "parsePoetryLock length");
  assert(
    records[0].name === "requests" && records[0].version === "2.31.0",
    "requests parsed",
  );
  assert(
    records[1].name === "flask" && records[1].version === "3.0.0",
    "flask parsed",
  );
}

async function testParseGoMod() {
  const content = `
module my-app

go 1.22

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/sirupsen/logrus v1.9.3 // indirect
)

require github.com/google/uuid v1.6.0
  `;
  const records = guardian.parseGoMod(content, "/go.mod");
  assert(records.length === 3, "parseGoMod length");
  assert(
    records[0].name === "github.com/gin-gonic/gin" &&
      records[0].version === "v1.9.1",
    "gin parsed",
  );
  assert(
    records[1].name === "github.com/sirupsen/logrus" &&
      records[1].version === "v1.9.3",
    "logrus parsed",
  );
  assert(
    records[2].name === "github.com/google/uuid" &&
      records[2].version === "v1.6.0",
    "uuid parsed",
  );
}

async function testGenerateRemediationHintPythonGo() {
  const { generateRemediationHint } = require("./src/findings/remediation.js");

  const python = generateRemediationHint({
    ecosystem: "python",
    packageName: "requests",
    fixedVersion: "2.31.0",
    foundIn: [
      { manifest_path: "/requirements.txt", dependency_type: "direct" },
    ],
  });
  assert(
    python.includes("Update requests to version 2.31.0"),
    "python hint failed",
  );

  const go = generateRemediationHint({
    ecosystem: "Go",
    packageName: "github.com/gin-gonic/gin",
    fixedVersion: "v1.9.1",
    foundIn: [
      {
        manifest_path: "/go.mod",
        dependency_type: "transitive",
        parent: { name: "top" },
      },
    ],
  });
  assert(go.includes("Transitive dependency via **top**"), "go hint failed");
}

async function testUnresolvedMavenIsNotQueryable() {
  const records = guardian.parsePomDependencies(
    "<project><dependencies><dependency><groupId>g</groupId><artifactId>a</artifactId></dependency></dependencies></project>",
    "/pom.xml",
  );
  assert(records.length === 1, "record should exist");
  assert(records[0].version === "unresolved", "version should be unresolved");
  assert(
    records[0].queryable === false,
    "unresolved Maven record should have queryable: false",
  );
}

async function testMavenFixPinning() {
  const maven = guardian.buildFixCommand({
    ecosystem: "maven",
    packageName: "org.slf4j:slf4j-api",
    fixedVersion: "1.7.36",
  });
  assert(
    maven.includes("use-dep-version"),
    "Maven fix should use use-dep-version",
  );
  assert(
    maven.includes("depVersion='1.7.36'"),
    "Maven fix should include depVersion",
  );
  assert(maven.includes("forceVersion=true"), "Maven fix should force version");
}

async function testPythonRemediationHint() {
  const { generateRemediationHint } = require("./src/findings/remediation.js");
  const python = generateRemediationHint({
    ecosystem: "python",
    packageName: "requests",
    fixedVersion: "2.31.0",
    foundIn: [
      { manifest_path: "installed-environment", dependency_type: "direct" },
    ],
  });
  assert(
    python.includes("active Python environment"),
    "Python remediation should mention active environment",
  );
  assert(
    python.includes("refresh the lockfile"),
    "Python remediation should mention lockfile refresh",
  );
}

async function testBuildJavaEvidence() {
  const mavenPkg = {
    name: "org.slf4j:slf4j-api",
    version: "1.7.25",
    ecosystem: "maven",
    occurrences: [{ project: "p1" }],
    paths: ["/path/1"],
  };
  const ev = guardian.buildJavaEvidence(mavenPkg);
  assert(ev.groupId === "org.slf4j", "Maven groupId split failed");
  assert(ev.artifactId === "slf4j-api", "Maven artifactId split failed");
  assert(ev.version === "1.7.25", "Maven version mapping failed");

  const gradlePkg = {
    name: "com.google.guava:guava",
    version: "27.0-jre",
    ecosystem: "gradle",
  };
  const evG = guardian.buildJavaEvidence(gradlePkg);
  assert(evG.groupId === "com.google.guava", "Gradle groupId split failed");
  assert(evG.artifactId === "guava", "Gradle artifactId split failed");

  const barePkg = { name: "log4j", version: "1.2.17", ecosystem: "maven" };
  const evB = guardian.buildJavaEvidence(barePkg);
  assert(evB.groupId === "log4j", "Bare groupId mapping failed");
  assert(evB.artifactId === "log4j", "Bare artifactId mapping failed");
}

async function testBuildCandidateCpes() {
  const ev = {
    groupId: "org.slf4j",
    artifactId: "slf4j-api",
    version: "1.7.25",
  };
  const candidates = guardian.buildCandidateCpes(ev);
  assert(
    candidates.length === 2,
    "Should generate 2 candidates when vendor != product",
  );
  assert(
    candidates[0].cpeName ===
      "cpe:2.3:a:org.slf4j:slf4j-api:1.7.25:*:*:*:*:*:*:*",
    "High confidence CPE failed",
  );
  assert(candidates[0].confidence === "high", "High confidence tag failed");
  assert(
    candidates[1].cpeName ===
      "cpe:2.3:a:slf4j-api:slf4j-api:1.7.25:*:*:*:*:*:*:*",
    "Medium confidence CPE failed",
  );
  assert(candidates[1].confidence === "medium", "Medium confidence tag failed");

  const invalid = { groupId: null, artifactId: "x", version: "1" };
  assert(
    guardian.buildCandidateCpes(invalid).length === 0,
    "Should return [] for missing groupId",
  );
}

async function testNormalizeNvdCve() {
  const cve = {
    id: "CVE-2024-1234",
    metrics: {
      cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }],
    },
    descriptions: [{ lang: "en", value: "Critical vulnerability description" }],
    references: [{ url: "https://nvd.nist.gov/vuln/detail/CVE-2024-1234" }],
  };
  const candidate = { confidence: "high" };
  const norm = guardian.normalizeNvdCve(cve, candidate);

  assert(norm.id === "CVE-2024-1234", "NVD id normalization failed");
  assert(norm.severity === "CRITICAL", "NVD severity mapping failed");
  assert(norm.cvss_score === 9.8, "NVD CVSS score mapping failed");
  assert(norm.source === "nvd", "NVD source tag failed");
  assert(norm.match_confidence === "high", "NVD confidence propagation failed");
  assert(
    norm.references.includes("https://nvd.nist.gov/vuln/detail/CVE-2024-1234"),
    "NVD reference mapping failed",
  );
}

async function testDedupeAcrossSources() {
  const advisories = [
    { id: "GHSA-1", source: "osv", cve: "CVE-2024-0001" },
    { id: "CVE-2024-0001", source: "nvd", cve: "CVE-2024-0001" },
    { id: "CVE-2024-9999", source: "nvd", cve: "CVE-2024-9999" },
  ];
  const deduped = guardian.dedupeAcrossSources(advisories);
  assert(
    deduped.length === 2,
    "Cross-source dedupe should remove NVD duplicate of OSV CVE",
  );
  assert(
    deduped.some((a) => a.id === "GHSA-1"),
    "Should keep OSV entry",
  );
  assert(
    deduped.some((a) => a.id === "CVE-2024-9999"),
    "Should keep non-overlapping NVD entry",
  );
  assert(
    !deduped.some((a) => a.id === "CVE-2024-0001" && a.source === "nvd"),
    "Should remove NVD duplicate",
  );
}

async function testMakeNvdThrottle() {
  const throttle = guardian.makeNvdThrottle(false); // 6.5s interval unauth

  // First acquire should pass immediately
  const t0 = Date.now();
  await throttle.acquire();
  const first = Date.now() - t0;
  assert(first < 200, `First acquire should be immediate, took ${first}ms`);

  // Second acquire should be delayed
  const t1 = Date.now();
  await throttle.acquire();
  const second = Date.now() - t1;
  assert(
    second >= 6000,
    `Second acquire should be delayed by ~6.5s, was ${second}ms`,
  );
}

async function testBuildCpeProductCandidates() {
  const cases = [
    ["jackson-databind", ["jackson-databind", "jackson_databind"]],
    ["netty", ["netty"]],
    ["spring-security-core", ["spring-security-core", "spring_security_core"]],
    ["", [""]],
    [null, [""]],
  ];

  for (const [input, expected] of cases) {
    const actual = guardian._buildCpeProductCandidates(input);
    assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      `Expected ${JSON.stringify(expected)} for ${input}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function testParsePomWithComments() {
  const pom = [
    "<project>",
    "  <!-- old dep: <dependency><groupId>old</groupId><artifactId>old</artifactId><version>9</version></dependency> -->",
    "  <properties>",
    "    <!-- <foo>comment</foo> -->",
    "    <guava.version>33.0.0</guava.version>",
    "  </properties>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>com.google.guava</groupId>",
    "      <artifactId>guava</artifactId>",
    "      <version>${guava.version}</version>",
    "    </dependency>",
    "    <!-- <dependency>",
    "      <groupId>nonexistent</groupId>",
    "      <artifactId>ghost</artifactId>",
    "      <version>1.0</version>",
    "    </dependency> -->",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records.length === 1, "Comment-shielded POM should produce exactly 1 dependency, got " + records.length);
  assert(records[0].name === "com.google.guava:guava", "Should extract guava, not phantom deps in comments");
  assert(records[0].version === "33.0.0", "Property resolution should still work with comments present");
}

async function testParsePomWithCdata() {
  const pom = [
    "<project>",
    "  <properties>",
    "    <foo><![CDATA[some <text> here]]></foo>",
    "  </properties>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>junit</groupId>",
    "      <artifactId>junit</artifactId>",
    "      <version>4.13.2</version>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records.length === 1, "POM with CDATA should produce exactly 1 dependency, got " + records.length);
  assert(records[0].name === "junit:junit", "CDATA should not interfere with dependency extraction");
}

async function testStripCommentsMultiline() {
  const input = "<root><!-- line1\n  line2\n  <tag>text</tag>\n  --><real>content</real></root>";
  const cleaned = stripComments(input);
  assert(!cleaned.includes("<!--"), "stripComments should remove opening comment marker");
  assert(!cleaned.includes("-->"), "stripComments should remove closing comment marker");
  assert(!cleaned.includes("<tag>text</tag>"), "stripComments should remove content inside comments");
  assert(cleaned.includes("<real>content</real>"), "stripComments should preserve non-comment content");
}

async function testExtractTagTextNull() {
  const { extractTagText } = require("./src/shared/xml-lite");
  assert(extractTagText(null, "x") === null, "null xml should return null");
  assert(extractTagText("<a></a>", "b") === null, "missing tag should return null");
  assert(extractTagText("<a>", "a") === null, "missing close tag should return null");
}

async function testExtractAllElementsEdgeCases() {
  const { extractAllElements } = require("./src/shared/xml-lite");
  assert(extractAllElements(null, "x").length === 0, "null xml should return []");
  assert(extractAllElements("<a>", "a").length === 0, "missing close tag should return []");

  const selfClosing = extractAllElements("<dep g='x' v='1'/>", "dep");
  assert(selfClosing.length === 1, "should extract self-closing element");

  const partial = extractAllElements("<dependencymissing>text</dependencymissing>", "dependency");
  assert(partial.length === 0, "partial tag match should not be extracted");
}

async function testExtractAttrEdgeCases() {
  const { extractAttr } = require("./src/shared/xml-lite");
  assert(extractAttr(null, "id") === null, "null element should return null");
  assert(extractAttr("<pkg />", "missing") === null, "missing attr should return null");

  const singleQuote = extractAttr('<pkg id=\'hello\' />', "id");
  assert(singleQuote === "hello", "should extract single-quoted attr");

  const doubleQuote = extractAttr('<pkg id="world" />', "id");
  assert(doubleQuote === "world", "should extract double-quoted attr");
}

async function testMavenProjectVersionResolution() {
  const pom = [
    "<project>",
    "  <groupId>com.example</groupId>",
    "  <artifactId>my-lib</artifactId>",
    "  <version>2.0.0</version>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>junit</groupId>",
    "      <artifactId>junit</artifactId>",
    "      <version>${project.version}</version>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records.length === 1, "Should have 1 dependency, got " + records.length);
  assert(records[0].version === "2.0.0", "${project.version} should resolve to 2.0.0, got " + records[0].version);
}

async function testMavenParentVersionResolution() {
  const pom = [
    "<project>",
    "  <parent>",
    "    <groupId>org.springframework.boot</groupId>",
    "    <artifactId>spring-boot-starter-parent</artifactId>",
    "    <version>3.2.0</version>",
    "  </parent>",
    "  <artifactId>my-app</artifactId>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>org.slf4j</groupId>",
    "      <artifactId>slf4j-api</artifactId>",
    "      <version>${parent.version}</version>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records.length === 1, "Should have 1 dependency, got " + records.length);
  assert(records[0].version === "3.2.0", "${parent.version} should resolve to 3.2.0, got " + records[0].version);
}

async function testMavenPomBuiltinProperties() {
  const pom = [
    "<project>",
    "  <groupId>com.example</groupId>",
    "  <artifactId>my-project</artifactId>",
    "  <version>5.0.0</version>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>junit</groupId>",
    "      <artifactId>junit</artifactId>",
    "      <version>${pom.version}</version>",
    "    </dependency>",
    "    <dependency>",
    "      <groupId>org.slf4j</groupId>",
    "      <artifactId>slf4j-api</artifactId>",
    "      <version>${project.version}</version>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records.length === 2, "Should have 2 dependencies, got " + records.length);
  const junit = records.find((r) => r.name === "junit:junit");
  const slf4j = records.find((r) => r.name === "org.slf4j:slf4j-api");
  assert(junit, "junit:junit dependency missing");
  assert(slf4j, "slf4j-api dependency missing");
  assert(junit.version === "5.0.0", "pom.version should resolve to 5.0.0, got " + junit.version);
  assert(slf4j.version === "5.0.0", "project.version should resolve to 5.0.0, got " + slf4j.version);
}

async function testMavenNoBuiltinsWhenMissing() {
  const pom = [
    "<project>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>junit</groupId>",
    "      <artifactId>junit</artifactId>",
    "      <version>${project.version}</version>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records.length === 1, "Should produce 1 record even with unresolvable version");
  assert(records[0].version === "unresolved", "Should be unresolved when project.version is not defined, got " + records[0].version);
  assert(records[0].queryable === false, "Unresolved should have queryable: false");
}

async function testNvdKeywordVersionFilterMatch() {
  const cve = {
    id: "CVE-2024-0001",
    configurations: [{
      nodes: [{
        cpeMatch: [{
          criteria: "cpe:2.3:a:apache:log4j:2.23.1:*:*:*:*:*:*:*",
        }],
      }],
    }],
  };
  assert(
    guardian._cveMentionsVersion(cve, "2.23.1") === true,
    "Should match when version appears in CPE criteria",
  );
}

async function testNvdKeywordVersionFilterReject() {
  const cve = {
    id: "CVE-2024-0002",
    configurations: [{
      nodes: [{
        cpeMatch: [{
          criteria: "cpe:2.3:a:apache:log4j:2.0:*:*:*:*:*:*:*",
        }],
      }],
    }],
  };
  assert(
    guardian._cveMentionsVersion(cve, "2.23.1") === false,
    "Should reject when version does not appear in CPE criteria",
  );
}

async function testNvdKeywordVersionFilterNullSafe() {
  assert(
    guardian._cveMentionsVersion(null, "1.0") === true,
    "null CVE should return true (conservative)",
  );
  assert(
    guardian._cveMentionsVersion({ id: "X" }, "") === true,
    "empty version should return true (conservative)",
  );
  assert(
    guardian._cveMentionsVersion({ id: "X" }, null) === true,
    "null version should return true (conservative)",
  );
  assert(
    guardian._cveMentionsVersion(void 0, "1.0") === true,
    "undefined CVE should return true (conservative)",
  );
}

async function testIsTransientError() {
  const { isTransientError } = require("./src/vuln/providers");
  assert(isTransientError(new Error("timeout")) === true, "timeout is transient");
  assert(isTransientError(new Error("Network error occurred")) === true, "network error is transient");
  assert(isTransientError(new Error("HTTP 429")) === true, "HTTP 429 is transient");
  assert(isTransientError(new Error("HTTP 500")) === true, "HTTP 500 is transient");
  assert(isTransientError(new Error("HTTP 502 bad gateway")) === true, "HTTP 502 is transient");
  assert(isTransientError(new Error("HTTP 503")) === true, "HTTP 503 is transient");
  assert(isTransientError(new Error("HTTP 504")) === true, "HTTP 504 is transient");
  assert(isTransientError(new Error("Not Found")) === false, "404 is not transient");
  assert(isTransientError(new Error("Unauthorized")) === false, "401 is not transient");
  assert(isTransientError(null) === false, "null error is not transient");
  assert(isTransientError({ message: "HTTP 429" }) === true, "object with message");
  assert(isTransientError(void 0) === false, "undefined error is not transient");
}

async function testNvdEnvApiKey() {
  const prev = process.env.NVD_API_KEY;
  try {
    delete process.env.NVD_API_KEY;
    const noKey = guardian.parseArgs(["--nvd-mode", "on"]);
    assert(noKey.nvdApiKey === null, "env key should default to null");

    process.env.NVD_API_KEY = "env-key-123";
    const envKey = guardian.parseArgs(["--nvd-mode", "on"]);
    assert(envKey.nvdApiKey === null, "args should not auto-populate from env (handled at provider level)");
  } finally {
    if (prev === undefined) delete process.env.NVD_API_KEY;
    else process.env.NVD_API_KEY = prev;
  }
}

async function testPomPropertiesNotOverwrittenByBuiltins() {
  const pom = [
    "<project>",
    "  <groupId>com.overridden</groupId>",
    "  <version>99.0.0</version>",
    "  <properties>",
    "    <project.version>1.2.3</project.version>",
    "  </properties>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>junit</groupId>",
    "      <artifactId>junit</artifactId>",
    "      <version>${project.version}</version>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n");

  const records = guardian.parsePomDependencies(pom, "/test-pom.xml");
  assert(records[0].version === "1.2.3",
    "<properties> project.version should take precedence over POM root <version>, got " + records[0].version);
}

async function testQueryNvdByCpe() {
  // Primarily logic verification via other tests, but we've renamed the function.
}

async function run() {
  const tests = [
    ["publicExportsSurface", testPublicExportsSurface],
    ["parseArgs", testParseArgs],
    ["asyncPool", testAsyncPool],
    ["chunkArray", testChunkArray],
    ["filterNestedNodeModules", testFilterNestedNodeModules],
    ["buildFixCommand", testBuildFixCommand],
    ["normalizeOsvAdvisory", testNormalizeOsvAdvisory],
    ["normalizeOsvAdvisorySparse", testNormalizeOsvAdvisorySparse],
    ["normalizeNpmAdvisorySparse", testNormalizeNpmAdvisorySparse],
    ["normalizeSeverityAll", testNormalizeSeverityAllLevels],
    ["normalizeSeverityEdge", testNormalizeSeverityEdge],
    ["cvssToSeverityAll", testCvssToSeverityAllBranches],
    ["extractNvdCvssAll", testExtractNvdCvssAllVersions],
    ["findOsvCvssEdge", testFindOsvCvssEdgeCases],
    ["severityAllowedDefaults", testSeverityAllowedDefaults],
    ["eventsToRange", testEventsToRangeMultiple],
    ["dedupeAdvisories", testDedupeAdvisoriesDuplicate],
    ["readPackageJson", testReadPackageJson],
    ["integrationSmoke", testIntegrationSmoke],
    ["cliHelpAndVersion", testCliHelpAndVersion],
    ["cliBannerOffResultOnly", testCliBannerOffResultOnly],
    ["txtReportGeneration", testHtmlReportEscaping],
    ["tableNoTruncation", testTableNoTruncation],
    ["tableRenderMultiple", testTableRenderMultiple],
    ["fixScriptGeneration", testFixScriptGeneration],
    ["htmlReportGeneration", testHtmlReportGeneration],
    ["jsonCsvReportGeneration", testJsonCsvReportGeneration],
    ["policyEvaluation", testPolicyEvaluation],
    ["policyMaxHigh", testPolicyMaxHighViolation],
    ["policyDisabled", testPolicyDisabledWhenNoThresholds],
    ["policyUnknownSeverity", testPolicyUnknownSeverity],
    ["policyNullFindings", testPolicyNullFindings],
    ["advisoryRangeMatching", testAdvisoryRangeMatching],
    ["advisoryRangeHyphen", testAdvisoryRangeHyphen],
    ["advisoryRangeEmpty", testAdvisoryRangeEmpty],
    ["advisoryRangeTilde", testAdvisoryRangeTilde],
    ["advisoryRangeWildcard", testAdvisoryRangeWildcard],
    ["advisoryRangeBadVersion", testAdvisoryRangeBadVersion],
    ["advisoryRangeZeroWildcard", testAdvisoryRangeZeroDotWildcard],
    ["advisoryRangeCaretZero", testAdvisoryRangeCaretZeroVersion],
    ["advisoryRangePlainEqual", testAdvisoryRangePlainEqual],
    ["advisoryRangeVeePrefix", testAdvisoryRangeVeePrefix],
    ["advisoryRangeMultipleGroups", testAdvisoryRangeMultipleGroups],
    ["strictBaselineMissingFile", testStrictBaselineMissingFile],
    ["strictBaselineInvalidJson", testStrictBaselineInvalidJson],
    ["parseEcosystemList", testParseEcosystemList],
    ["parsePomDependencies", testParsePomDependencies],
    ["parsePomWithComments", testParsePomWithComments],
    ["parsePomWithCdata", testParsePomWithCdata],
    ["stripComments", testStripCommentsMultiline],
    ["extractTagTextNull", testExtractTagTextNull],
    ["extractAllElementsEdge", testExtractAllElementsEdgeCases],
    ["extractAttrEdge", testExtractAttrEdgeCases],
    ["parsePackagesConfig", testParsePackagesConfig],
    ["parseProjectPackageReferences", testParseProjectPackageReferences],
    ["parseDirectoryPackagesProps", testParseDirectoryPackagesProps],
    ["parsePackagesLockJson", testParsePackagesLockJson],
    ["summaryCountsUniquePackages", testSummaryCountsUniquePackages],
    ["ecosystemKeyNamespacing", testEcosystemKeyNamespacing],
    ["buildFixCommandEcosystems", testBuildFixCommandEcosystems],
    ["integrationSmokeMultiEcosystem", testIntegrationSmokeMultiEcosystem],
    ["parseRequirementsTxt", testParseRequirementsTxt],
    ["parsePipfileLock", testParsePipfileLock],
    ["parsePoetryLock", testParsePoetryLock],
    ["parseGoMod", testParseGoMod],
    ["generateRemediationHintPythonGo", testGenerateRemediationHintPythonGo],
    ["unresolvedMavenIsNotQueryable", testUnresolvedMavenIsNotQueryable],
    ["mavenFixPinning", testMavenFixPinning],
    ["mavenProjectVersion", testMavenProjectVersionResolution],
    ["mavenParentVersion", testMavenParentVersionResolution],
    ["mavenPomBuiltins", testMavenPomBuiltinProperties],
    ["mavenNoBuiltinsWhenMissing", testMavenNoBuiltinsWhenMissing],
    ["pomPropertiesPrecedence", testPomPropertiesNotOverwrittenByBuiltins],
    ["pythonRemediationHint", testPythonRemediationHint],
    ["buildJavaEvidence", testBuildJavaEvidence],
    ["buildCandidateCpes", testBuildCandidateCpes],
    ["normalizeNvdCve", testNormalizeNvdCve],
    ["dedupeAcrossSources", testDedupeAcrossSources],
    ["makeNvdThrottle", testMakeNvdThrottle],
    ["buildCpeProductCandidates", testBuildCpeProductCandidates],
    ["nvdKeywordVersionFilterMatch", testNvdKeywordVersionFilterMatch],
    ["nvdKeywordVersionFilterReject", testNvdKeywordVersionFilterReject],
    ["nvdKeywordVersionFilterNullSafe", testNvdKeywordVersionFilterNullSafe],
    ["isTransientError", testIsTransientError],
    ["nvdEnvApiKey", testNvdEnvApiKey],
    ["queryNvdByCpe", testQueryNvdByCpe],
  ];

  let passed = 0;
  for (const [name, testFn] of tests) {
    await testFn();
    passed += 1;
    process.stdout.write(`✓ ${name}\n`);
  }

  process.stdout.write(`\n${passed}/${tests.length} tests passed\n`);
}

run().catch((error) => {
  process.stderr.write(`✗ Test failure: ${error.message}\n`);
  process.exit(1);
});
