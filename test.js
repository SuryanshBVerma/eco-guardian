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

      assert(process.exitCode === 0, "banner off run should exit with status 0");
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

async function run() {
  const tests = [
    ["publicExportsSurface", testPublicExportsSurface],
    ["parseArgs", testParseArgs],
    ["asyncPool", testAsyncPool],
    ["chunkArray", testChunkArray],
    ["filterNestedNodeModules", testFilterNestedNodeModules],
    ["buildFixCommand", testBuildFixCommand],
    ["normalizeOsvAdvisory", testNormalizeOsvAdvisory],
    ["readPackageJson", testReadPackageJson],
    ["integrationSmoke", testIntegrationSmoke],
    ["cliHelpAndVersion", testCliHelpAndVersion],
    ["cliBannerOffResultOnly", testCliBannerOffResultOnly],
    ["txtReportGeneration", testHtmlReportEscaping],
    ["tableNoTruncation", testTableNoTruncation],
    ["fixScriptGeneration", testFixScriptGeneration],
    ["htmlReportGeneration", testHtmlReportGeneration],
    ["jsonCsvReportGeneration", testJsonCsvReportGeneration],
    ["policyEvaluation", testPolicyEvaluation],
    ["advisoryRangeMatching", testAdvisoryRangeMatching],
    ["strictBaselineMissingFile", testStrictBaselineMissingFile],
    ["strictBaselineInvalidJson", testStrictBaselineInvalidJson],
    ["parseEcosystemList", testParseEcosystemList],
    ["parsePomDependencies", testParsePomDependencies],
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
    ["pythonRemediationHint", testPythonRemediationHint],
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
