'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const guardian = require('./npm-guardian');
const { writeTxtReport } = require('./src/report/txt');
const { writeFixScript } = require('./src/report/fix-script');
const { renderFindingsTable } = require('./src/report/console');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function withTempDir(fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'npm-guardian-test-'));
  try {
    return await fn(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function testParseArgs() {
  const a = guardian.parseArgs(['--path', '/tmp/x', '--json', '--severity', 'high', '--fix', '--global-only', '--no-cache']);
  assert(a.path === '/tmp/x', 'parseArgs --path failed');
  assert(a.pathExplicit === true, 'parseArgs pathExplicit should be true when --path is provided');
  assert(a.json === true && a.fix === true && a.globalOnly === true && a.noCache === true, 'parseArgs boolean flags failed');
  assert(a.severity === 'high', 'parseArgs --severity failed');
  const d = guardian.parseArgs(['--export', 'out.txt']);
  assert(d.exportTxt === 'out.txt', 'parseArgs --export alias failed');
  const e = guardian.parseArgs(['--export-txt', 'report.txt']);
  assert(e.exportTxt === 'report.txt', 'parseArgs --export-txt failed');

  const b = guardian.parseArgs([]);
  assert(b.pathExplicit === false, 'parseArgs pathExplicit default should be false');

  let threw = false;
  try { guardian.parseArgs(['--severity', 'bad']); } catch (_) { threw = true; }
  assert(threw, 'parseArgs should reject invalid severity');

  threw = false;
  try { guardian.parseArgs(['--path']); } catch (_) { threw = true; }
  assert(threw, 'parseArgs should reject missing --path value');

  threw = false;
  try { guardian.parseArgs(['--export-html', 'report.html']); } catch (_) { threw = true; }
  assert(threw, 'parseArgs should reject --export-html');
}

async function testPublicExportsSurface() {
  const expected = [
    'VERSION',
    'PLATFORM',
    'parseArgs',
    'asyncPool',
    'chunkArray',
    'filterNestedNodeModules',
    'readPackageJson',
    'normalizeOsvAdvisory',
    'buildFixCommand',
    'runScan',
    'main'
  ];
  for (const key of expected) {
    assert(Object.prototype.hasOwnProperty.call(guardian, key), `missing export: ${key}`);
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
  assert(results.length === items.length, 'asyncPool result length mismatch');
  assert(results[0] === 0 && results[10] === 20, 'asyncPool result values mismatch');
}

async function testChunkArray() {
  const arr = Array.from({ length: 2847 }, (_, i) => i);
  const chunks = guardian.chunkArray(arr, 1000);
  assert(chunks.length === 3, 'chunkArray should produce 3 chunks');
  assert(chunks[0].length === 1000, 'chunkArray first chunk wrong length');
  assert(chunks[1].length === 1000, 'chunkArray second chunk wrong length');
  assert(chunks[2].length === 847, 'chunkArray last chunk wrong length');
}

async function testFilterNestedNodeModules() {
  const input = [
    '/a/node_modules',
    '/a/node_modules/b/node_modules',
    '/x/y/node_modules',
    '/x/y/node_modules/z/node_modules',
    '/x/y/node_modules'
  ];

  const output = guardian.filterNestedNodeModules(input);
  assert(output.includes(path.resolve('/a/node_modules')), 'filterNestedNodeModules should keep top-level node_modules');
  assert(output.includes(path.resolve('/x/y/node_modules')), 'filterNestedNodeModules should keep valid node_modules');
  assert(!output.some((p) => p.endsWith('/b/node_modules') || p.endsWith('\\b\\node_modules')), 'filterNestedNodeModules should remove nested node_modules');
  assert(output.length === 2, 'filterNestedNodeModules should dedupe and strip nested');
}

async function testBuildFixCommand() {
  const direct = guardian.buildFixCommand({ packageName: 'axios', fixedVersion: '1.2.3', dependencyType: 'direct', isGlobal: false, parentPackage: null });
  assert(direct === 'npm install axios@1.2.3', 'buildFixCommand direct fix failed');

  const noFixDirect = guardian.buildFixCommand({ packageName: 'left-pad', fixedVersion: null, dependencyType: 'direct', isGlobal: false, parentPackage: null });
  assert(noFixDirect === 'npm uninstall left-pad', 'buildFixCommand direct no-fix failed');

  const globalFix = guardian.buildFixCommand({ packageName: 'npm', fixedVersion: '10.0.0', dependencyType: 'direct', isGlobal: true, parentPackage: null });
  assert(globalFix === 'npm install -g npm@10.0.0', 'buildFixCommand global fix failed');

  const transitive = guardian.buildFixCommand({ packageName: 'lodash', fixedVersion: null, dependencyType: 'transitive', isGlobal: false, parentPackage: { name: 'webpack' } });
  assert(transitive === 'npm install webpack@latest', 'buildFixCommand transitive failed');
}

async function testNormalizeOsvAdvisory() {
  const normalized = guardian.normalizeOsvAdvisory({
    id: 'GHSA-aaaa-bbbb-cccc',
    aliases: ['CVE-2026-1111'],
    database_specific: { severity: 'critical' },
    severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/9.8' }],
    summary: 'Critical issue',
    affected: [{ ranges: [{ events: [{ introduced: '0' }, { fixed: '1.2.3' }] }] }],
    references: [{ url: 'https://example.com/advisory' }]
  });

  assert(normalized.id === 'GHSA-aaaa-bbbb-cccc', 'normalizeOsvAdvisory id mismatch');
  assert(normalized.cve === 'CVE-2026-1111', 'normalizeOsvAdvisory cve mismatch');
  assert(normalized.severity === 'CRITICAL', 'normalizeOsvAdvisory severity mapping failed');
  assert(normalized.cvss_score === 9.8, 'normalizeOsvAdvisory cvss parse failed');
  assert(Array.isArray(normalized.fixed_versions) && normalized.fixed_versions[0] === '1.2.3', 'normalizeOsvAdvisory fixed_versions failed');
}

async function testReadPackageJson() {
  await withTempDir(async (root) => {
    const ok = path.join(root, 'ok');
    const bad = path.join(root, 'bad');
    const missingField = path.join(root, 'missing');
    await fsp.mkdir(ok, { recursive: true });
    await fsp.mkdir(bad, { recursive: true });
    await fsp.mkdir(missingField, { recursive: true });

    await fsp.writeFile(path.join(ok, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }), 'utf8');
    await fsp.writeFile(path.join(bad, 'package.json'), '{not json', 'utf8');
    await fsp.writeFile(path.join(missingField, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8');

    const parsed = await guardian.readPackageJson(ok);
    const badParsed = await guardian.readPackageJson(bad);
    const missingParsed = await guardian.readPackageJson(missingField);
    const noneParsed = await guardian.readPackageJson(path.join(root, 'none'));

    assert(parsed && parsed.name === 'x' && parsed.version === '1.0.0', 'readPackageJson valid package failed');
    assert(badParsed === null, 'readPackageJson bad JSON should return null');
    assert(missingParsed === null, 'readPackageJson missing fields should return null');
    assert(noneParsed === null, 'readPackageJson missing file should return null');
  });
}

async function testIntegrationSmoke() {
  await withTempDir(async (root) => {
    const exportPath = path.join(root, 'report.txt');
    process.env.NPM_GUARDIAN_DISABLE_GLOBAL = '1';
    const originalWrite = process.stdout.write;
    let result;
    try {
      process.stdout.write = () => true;
      result = await guardian.runScan({
      path: root,
      pathExplicit: true,
        globalOnly: false,
        severity: 'critical',
        json: true,
        noCache: true,
        fix: false,
        exportTxt: exportPath,
        help: false,
        version: false,
        global: false,
        allDrives: false,
        verbose: false
      });
    } finally {
      process.stdout.write = originalWrite;
    }
    assert(Array.isArray(result.findings), 'integration smoke findings should be array');
    assert(result.findings.length === 0, 'integration smoke expected zero vulnerabilities');
    assert(result.packageCount === 0, 'integration smoke expected zero packages scanned');
    const exists = fs.existsSync(exportPath);
    assert(exists, 'integration smoke expected TXT report file');
    const report = await fsp.readFile(exportPath, 'utf8');
    assert(report.includes('npm-guardian report'), 'integration smoke expected report content');
    assert(report.includes('Generated:'), 'integration smoke expected generated timestamp');
    assert(report.includes('Findings'), 'integration smoke expected findings section');
  });
}

async function testCliHelpAndVersion() {
  const originalWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  let out = '';

  try {
    process.stdout.write = (chunk) => { out += String(chunk); return true; };
    process.exitCode = undefined;
    await guardian.main(['--help']);
    assert(process.exitCode === 0, 'help command should exit with status 0');
    assert(out.includes('Usage:'), 'help output should include Usage');
    assert(out.includes('--export-txt <file>'), 'help output should include TXT export flag');

    out = '';
    process.exitCode = undefined;
    await guardian.main(['--version']);
    assert(process.exitCode === 0, 'version command should exit with status 0');
    assert(String(out || '').trim() === guardian.VERSION, 'version output should match VERSION export');
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
  }
}

async function testHtmlReportEscaping() {
  await withTempDir(async (root) => {
    const out = path.join(root, 'report.txt');
    const findings = [{
      package: '<pkg>',
      version: '1.0.0',
      severity: 'HIGH',
      advisory_id: 'ADV-1',
      title: 'Dangerous <script>alert(1)</script>',
      found_in: [{ project: 'proj&one', dependency_type: 'direct', parent: null }],
      fix_commands: ['npm install "<pkg>"@latest'],
      fix_command: 'npm install "<pkg>"@latest',
      references: ['https://example.com/?a=1&b=2']
    }];
    const file = await writeTxtReport(findings, 1, { exportTxt: out });
    assert(file === path.resolve(process.cwd(), out), 'writeTxtReport should return absolute output path');
    const text = await fsp.readFile(out, 'utf8');
    assert(text.includes('<pkg>@1.0.0'), 'TXT report should include package');
    assert(text.includes('Dangerous <script>alert(1)</script>'), 'TXT report should preserve plain text content');
    assert(text.includes('Reference: https://example.com/?a=1&b=2'), 'TXT report should include reference');
  });
}

async function testTableNoTruncation() {
  const table = renderFindingsTable([{
    severity: 'CRITICAL',
    package: 'very-long-package-name-that-should-not-be-truncated',
    version: '9.9.9',
    advisory_id: 'ADV-ULTRA-LONG-IDENTIFIER-123456789',
    found_in: [{ project: 'project-1' }],
    fix_command: 'cd /d "D:\\Some\\Very\\Long\\Project\\Path\\With\\No\\Truncation" && npm install very-long-package-name-that-should-not-be-truncated@latest'
  }]);
  assert(!table.includes('...'), 'table should not truncate text');
  assert(table.includes('very-long-package-name-that-should-not-be-truncated@9.9.9'), 'table should include full package');
}

async function testFixScriptGeneration() {
  await withTempDir(async (root) => {
    const prevCwd = process.cwd();
    process.chdir(root);
    try {
      const findings = [{
        package: 'lodash',
        version: '4.17.19',
        fix_steps: [
          { project: '(global)', command: 'npm install -g lodash@latest' },
          { project: '/tmp/project-a', command: 'npm install lodash@latest' },
          { project: '/tmp/project-a', command: 'npm install lodash@latest' }
        ]
      }];
      const file = await writeFixScript(findings, { fix: true });
      assert(file && fs.existsSync(file), 'fix script should be written');
      const text = await fsp.readFile(file, 'utf8');
      assert(text.includes('npm-guardian fix script - generated'), 'fix script should include generation header');
      assert(text.includes('npm install -g lodash@latest'), 'fix script should include global command');
      assert(text.includes('npm install lodash@latest'), 'fix script should include project command');
    } finally {
      process.chdir(prevCwd);
    }
  });
}

async function run() {
  const tests = [
    ['publicExportsSurface', testPublicExportsSurface],
    ['parseArgs', testParseArgs],
    ['asyncPool', testAsyncPool],
    ['chunkArray', testChunkArray],
    ['filterNestedNodeModules', testFilterNestedNodeModules],
    ['buildFixCommand', testBuildFixCommand],
    ['normalizeOsvAdvisory', testNormalizeOsvAdvisory],
    ['readPackageJson', testReadPackageJson],
    ['integrationSmoke', testIntegrationSmoke],
    ['cliHelpAndVersion', testCliHelpAndVersion],
    ['txtReportGeneration', testHtmlReportEscaping],
    ['tableNoTruncation', testTableNoTruncation],
    ['fixScriptGeneration', testFixScriptGeneration]
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
