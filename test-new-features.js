'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const os = require('os')
const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')

const guardian = require('./eco-guardian')
const { newRunId, stableId, stablePackageId, stableFindingId, stableSummaryId, createScanContext } = require('./src/shared/ids')
const { classifyRoot, isBroadRoot, baselineCandidateRoots, projectCandidateRoots, resolveProfileRoots, resolveLegacyRoots } = require('./src/scan/roots')
const { loadExposureCatalog, parseExposureCatalog, validateExposureCatalog, validateExposureCatalogEntry, buildCatalogIndex } = require('./src/exposure/catalog')
const { matchExposureCatalog, buildExposureFinding } = require('./src/exposure/match')
const { writeInventoryJsonl, buildPackageRecord, buildFindingRecord, buildScanSummaryRecord } = require('./src/report/inventory-jsonl')
const { runSelftest } = require('./src/app/selftest')
const { applyBaseline } = require('./src/baseline')
const { buildCommand, validateState, normalizeState, shellQuote } = require('./src/ui/command-builder')
const { SCAN_PROFILES, DEFAULT_SCAN_PROFILE, ROOT_KINDS, SCAN_SCHEMA_VERSION, DEFAULT_MAX_CATALOG_SIZE } = require('./src/config/constants')

async function withTempDir (fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'eco-guardian-test-features-'))
  try {
    return await fn(root)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
}

test('constants exports new scan profile constants', () => {
  assert.deepStrictEqual(SCAN_PROFILES, ['legacy', 'baseline', 'project', 'deep'])
  assert.strictEqual(DEFAULT_SCAN_PROFILE, 'legacy')
  assert.strictEqual(SCAN_SCHEMA_VERSION, '0.1.0')
  assert.strictEqual(DEFAULT_MAX_CATALOG_SIZE, 64 * 1024 * 1024)
  assert.ok(ROOT_KINDS.globalPackage === 'global_package_root')
  assert.ok(ROOT_KINDS.userPackage === 'user_package_root')
  assert.ok(ROOT_KINDS.project === 'project_root')
  assert.ok(ROOT_KINDS.editorExtension === 'editor_extension_root')
  assert.ok(ROOT_KINDS.deepHome === 'deep_home_root')
})

test('newRunId generates unique run IDs', () => {
  const id1 = newRunId()
  const id2 = newRunId()
  assert.ok(typeof id1 === 'string')
  assert.ok(id1.startsWith('run_'))
  assert.notStrictEqual(id1, id2)
})

test('stableId generates deterministic hashes', () => {
  const id1 = stableId('test', ['a', 'b', 'c'])
  const id2 = stableId('test', ['a', 'b', 'c'])
  const id3 = stableId('test', ['a', 'b', 'd'])
  assert.strictEqual(id1, id2)
  assert.notStrictEqual(id1, id3)
  assert.ok(id1.startsWith('test:'))
})

test('stablePackageId generates deterministic package IDs', () => {
  const context = { runId: 'test_run' }
  const pkg = { ecosystem: 'npm', name: 'lodash', version: '4.17.21' }
  const id1 = stablePackageId(pkg, context)
  const id2 = stablePackageId(pkg, { runId: 'different_run' })
  assert.strictEqual(id1, id2)
  assert.ok(id1.startsWith('pkg:'))
})

test('stableFindingId generates deterministic finding IDs', () => {
  const context = { runId: 'test_run' }
  const finding = { ecosystem: 'npm', package: 'lodash', version: '4.17.21', advisory_id: 'GHSA-1234' }
  const id1 = stableFindingId(finding, context)
  const id2 = stableFindingId(finding, { runId: 'different_run' })
  assert.strictEqual(id1, id2)
  assert.ok(id1.startsWith('finding:'))
})

test('stableSummaryId generates deterministic summary IDs', () => {
  const context = { runId: 'test_run', packageCount: 100, findingCount: 5 }
  const id1 = stableSummaryId(context)
  const id2 = stableSummaryId(context)
  assert.strictEqual(id1, id2)
  assert.ok(id1.startsWith('summary:'))
})

test('createScanContext creates valid scan context', () => {
  const options = { profile: 'baseline', ecosystems: ['npm', 'python'], graphResolution: true, severity: 'high' }
  const context = createScanContext(options)
  assert.ok(context.runId.startsWith('run_'))
  assert.strictEqual(context.schemaVersion, '0.1.0')
  assert.strictEqual(context.profile, 'baseline')
  assert.ok(context.startedAt)
  assert.strictEqual(context.status, 'running')
  assert.deepStrictEqual(context.options.ecosystems, ['npm', 'python'])
  assert.strictEqual(context.options.graphResolution, true)
  assert.strictEqual(context.options.severity, 'high')
})

test('classifyRoot classifies paths correctly', () => {
  const home = os.homedir()
  assert.strictEqual(classifyRoot(home, 'legacy'), ROOT_KINDS.userPackage)
  assert.strictEqual(classifyRoot(path.join(home, 'projects', 'myapp'), 'legacy'), ROOT_KINDS.project)
  assert.strictEqual(classifyRoot(path.join(home, '.vscode', 'extensions'), 'legacy'), ROOT_KINDS.editorExtension)
})

test('isBroadRoot detects broad roots', () => {
  assert.strictEqual(isBroadRoot(os.homedir()), true)
  assert.strictEqual(isBroadRoot('/some/project/path'), false)
  assert.strictEqual(isBroadRoot(path.join(os.homedir(), 'projects')), false)
})

test('resolveProfileRoots rejects broad roots for baseline profile', async () => {
  const home = os.homedir()
  await assert.rejects(
    () => resolveProfileRoots({ profile: 'baseline', roots: [home] }),
    /Broad root/
  )
})

test('resolveProfileRoots rejects broad roots for project profile', async () => {
  const home = os.homedir()
  await assert.rejects(
    () => resolveProfileRoots({ profile: 'project', roots: [home] }),
    /Broad root/
  )
})

test('resolveProfileRoots requires explicit roots for deep profile', async () => {
  await assert.rejects(
    () => resolveProfileRoots({ profile: 'deep', roots: [] }),
    /Deep profile requires at least one explicit --root/
  )
})

test('baselineCandidateRoots returns candidate roots without bare home', () => {
  const home = os.homedir()
  const candidates = baselineCandidateRoots(home)
  assert.ok(Array.isArray(candidates))
  assert.ok(candidates.length > 0)
  assert.ok(candidates.every((c) => c.path && c.kind))
  assert.ok(!candidates.some((c) => c.path === home), 'Should not include bare home directory')
})

test('projectCandidateRoots returns candidate roots without bare home', () => {
  const home = os.homedir()
  const candidates = projectCandidateRoots(home)
  assert.ok(Array.isArray(candidates))
  assert.ok(candidates.length > 0)
  assert.ok(candidates.some((c) => c.kind === ROOT_KINDS.project))
  assert.ok(!candidates.some((c) => c.path === home), 'Should not include bare home directory')
})

test('parseExposureCatalog parses valid catalog', () => {
  const raw = JSON.stringify({
    schema_version: '0.1.0',
    entries: [
      {
        id: 'adv-001',
        name: 'Test advisory',
        ecosystem: 'npm',
        package: 'lodash',
        versions: ['4.17.20'],
        severity: 'high'
      }
    ]
  })
  const catalog = parseExposureCatalog(raw)
  assert.strictEqual(catalog.schema_version, '0.1.0')
  assert.strictEqual(catalog.entries.length, 1)
  assert.strictEqual(catalog.entries[0].id, 'adv-001')
})

test('parseExposureCatalog rejects missing schema_version', () => {
  const raw = JSON.stringify({ entries: [] })
  assert.throws(() => parseExposureCatalog(raw), /schema_version/)
})

test('parseExposureCatalog rejects missing entries', () => {
  const raw = JSON.stringify({ schema_version: '0.1.0' })
  assert.throws(() => parseExposureCatalog(raw), /entries/)
})

test('parseExposureCatalog rejects unsupported schema_version', () => {
  const raw = JSON.stringify({
    schema_version: '99.0.0',
    entries: [{ id: 'test', ecosystem: 'npm', package: 'lodash', versions: ['1.0.0'] }]
  })
  assert.throws(() => parseExposureCatalog(raw), /Unsupported schema_version/)
})

test('validateExposureCatalogEntry validates entry fields', () => {
  const validEntry = { id: 'test', ecosystem: 'npm', package: 'lodash', versions: ['1.0.0'] }
  const errors = validateExposureCatalogEntry(validEntry, 0)
  assert.strictEqual(errors.length, 0)

  const invalidEntry = { ecosystem: 'npm' }
  const errors2 = validateExposureCatalogEntry(invalidEntry, 0)
  assert.ok(errors2.length > 0)
  assert.ok(errors2.some((e) => e.includes('id')))
  assert.ok(errors2.some((e) => e.includes('package')))
  assert.ok(errors2.some((e) => e.includes('versions')))
})

test('validateExposureCatalog validates full catalog', () => {
  const valid = {
    schema_version: '0.1.0',
    entries: [{ id: 'test', ecosystem: 'npm', package: 'lodash', versions: ['1.0.0'] }]
  }
  const result = validateExposureCatalog(valid)
  assert.strictEqual(result.valid, true)
  assert.strictEqual(result.errors.length, 0)

  const invalid = { schema_version: '0.1.0', entries: 'not-array' }
  const result2 = validateExposureCatalog(invalid)
  assert.strictEqual(result2.valid, false)
})

test('buildCatalogIndex creates correct index', () => {
  const entries = [
    { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20', '4.17.21'], severity: 'high' },
    { id: 'adv-2', ecosystem: 'npm', package: 'express', versions: ['4.18.0'], severity: 'critical' }
  ]
  const index = buildCatalogIndex(entries)
  assert.strictEqual(index.size, 3)
  assert.ok(index.has('npm|lodash|4.17.20'))
  assert.ok(index.has('npm|lodash|4.17.21'))
  assert.ok(index.has('npm|express|4.18.0'))
  assert.strictEqual(index.get('npm|lodash|4.17.20').length, 1)
})

test('buildCatalogIndex deduplicates entries for same version', () => {
  const entries = [
    { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' },
    { id: 'adv-2', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'critical' }
  ]
  const index = buildCatalogIndex(entries)
  assert.strictEqual(index.size, 1)
  assert.strictEqual(index.get('npm|lodash|4.17.20').length, 2)
})

test('matchExposureCatalog matches vulnerable packages', () => {
  const packageMap = new Map()
  packageMap.set('npm|lodash|4.17.20', {
    ecosystem: 'npm',
    name: 'lodash',
    version: '4.17.20',
    paths: ['/test'],
    occurrences: [{ project: 'test', manifest_path: '/test/package.json', dependency_type: 'direct' }]
  })
  packageMap.set('npm|express|4.18.0', {
    ecosystem: 'npm',
    name: 'express',
    version: '4.18.0',
    paths: ['/test'],
    occurrences: []
  })

  const catalog = {
    entries: [
      { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' }
    ],
    index: buildCatalogIndex([
      { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' }
    ])
  }

  const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
  const findings = matchExposureCatalog(packageMap, catalog, {}, scanContext)
  assert.strictEqual(findings.length, 1)
  assert.strictEqual(findings[0].package, 'lodash')
  assert.strictEqual(findings[0].version, '4.17.20')
  assert.strictEqual(findings[0].source, 'exposure-catalog')
  assert.strictEqual(findings[0].match_confidence, 'high')
  assert.ok(findings[0].finding_id)
  assert.strictEqual(findings[0].severity, 'high')
})

test('matchExposureCatalog returns empty for no matches', () => {
  const packageMap = new Map()
  packageMap.set('npm|safe-pkg|1.0.0', {
    ecosystem: 'npm',
    name: 'safe-pkg',
    version: '1.0.0',
    paths: ['/test'],
    occurrences: []
  })

  const catalog = {
    entries: [{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' }],
    index: buildCatalogIndex([{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' }])
  }

  const findings = matchExposureCatalog(packageMap, catalog, {}, null)
  assert.strictEqual(findings.length, 0)
})

test('matchExposureCatalog matches across ecosystems', () => {
  const packageMap = new Map()
  packageMap.set('npm|lodash|4.17.20', {
    ecosystem: 'npm', name: 'lodash', version: '4.17.20', paths: [], occurrences: []
  })
  packageMap.set('python|requests|2.28.0', {
    ecosystem: 'python', name: 'requests', version: '2.28.0', paths: [], occurrences: []
  })

  const catalog = {
    entries: [
      { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' },
      { id: 'adv-2', ecosystem: 'python', package: 'requests', versions: ['2.28.0'], severity: 'critical' }
    ],
    index: buildCatalogIndex([
      { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' },
      { id: 'adv-2', ecosystem: 'python', package: 'requests', versions: ['2.28.0'], severity: 'critical' }
    ])
  }

  const findings = matchExposureCatalog(packageMap, catalog, {}, null)
  assert.strictEqual(findings.length, 2)
})

test('buildPackageRecord creates valid record', () => {
  const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
  const pkg = {
    ecosystem: 'npm',
    name: 'lodash',
    version: '4.17.21',
    osvEcosystem: 'npm',
    paths: ['/test/node_modules/lodash'],
    occurrences: [{ project: 'test', manifest_path: '/test/package.json', dependency_type: 'direct' }]
  }
  const record = buildPackageRecord(pkg, scanContext)
  assert.strictEqual(record.record_type, 'package')
  assert.ok(record.record_id.startsWith('pkg:'))
  assert.strictEqual(record.run_id, scanContext.runId)
  assert.strictEqual(record.schema_version, '0.1.0')
  assert.strictEqual(record.ecosystem, 'npm')
  assert.strictEqual(record.name, 'lodash')
  assert.strictEqual(record.version, '4.17.21')
  assert.ok(record.timestamp)
})

test('buildFindingRecord creates valid record', () => {
  const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
  const finding = {
    ecosystem: 'npm',
    package: 'lodash',
    version: '4.17.21',
    advisory_id: 'GHSA-1234',
    cve: 'CVE-2021-1234',
    severity: 'high',
    cvss: 7.5,
    title: 'Prototype Pollution',
    source: 'osv',
    match_confidence: 'high',
    resolution_mode: 'inventory',
    fixed_version: '4.17.21',
    fingerprint: 'npm|lodash|4.17.21|GHSA-1234'
  }
  const record = buildFindingRecord(finding, scanContext)
  assert.strictEqual(record.record_type, 'finding')
  assert.ok(record.record_id.startsWith('finding:'))
  assert.strictEqual(record.run_id, scanContext.runId)
  assert.strictEqual(record.severity, 'high')
  assert.strictEqual(record.advisory_id, 'GHSA-1234')
  assert.strictEqual(record.cve, 'CVE-2021-1234')
})

test('buildScanSummaryRecord creates valid record', () => {
  const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
  scanContext.status = 'complete'
  const result = {
    packageCount: 100,
    findings: [{ severity: 'high' }, { severity: 'low' }],
    exitCode: 1,
    policy: { enabled: false, passed: true }
  }
  const record = buildScanSummaryRecord(scanContext, result)
  assert.strictEqual(record.record_type, 'scan_summary')
  assert.ok(record.record_id.startsWith('summary:'))
  assert.strictEqual(record.run_id, scanContext.runId)
  assert.strictEqual(record.package_count, 100)
  assert.strictEqual(record.finding_count, 2)
  assert.strictEqual(record.exit_code, 1)
  assert.strictEqual(record.status, 'complete')
})

test('parseArgs accepts --profile flag', () => {
  const args = guardian.parseArgs(['--profile', 'baseline'])
  assert.strictEqual(args.profile, 'baseline')
})

test('parseArgs accepts --profile deep', () => {
  const args = guardian.parseArgs(['--profile', 'deep'])
  assert.strictEqual(args.profile, 'deep')
})

test('parseArgs rejects invalid profile', () => {
  assert.throws(() => guardian.parseArgs(['--profile', 'invalid']), /Invalid --profile/)
})

test('parseArgs accepts --root flag', () => {
  const args = guardian.parseArgs(['--root', '/test/path'])
  assert.deepStrictEqual(args.roots, ['/test/path'])
})

test('parseArgs accepts multiple --root flags', () => {
  const args = guardian.parseArgs(['--root', '/path1', '--root', '/path2'])
  assert.deepStrictEqual(args.roots, ['/path1', '/path2'])
})

test('parseArgs accepts --list-roots flag', () => {
  const args = guardian.parseArgs(['--list-roots'])
  assert.strictEqual(args.listRoots, true)
})

test('parseArgs accepts --all-users flag', () => {
  const args = guardian.parseArgs(['--all-users'])
  assert.strictEqual(args.allUsers, true)
})

test('parseArgs accepts --exposure-catalog flag', () => {
  const args = guardian.parseArgs(['--exposure-catalog', 'catalog.json'])
  assert.strictEqual(args.exposureCatalog, 'catalog.json')
})

test('parseArgs accepts --offline-exposure-only flag', () => {
  const args = guardian.parseArgs(['--offline-exposure-only'])
  assert.strictEqual(args.offlineExposureOnly, true)
})

test('parseArgs accepts --max-catalog-size flag', () => {
  const args = guardian.parseArgs(['--max-catalog-size', '1048576'])
  assert.strictEqual(args.maxCatalogSize, 1048576)
})

test('parseArgs rejects invalid --max-catalog-size', () => {
  assert.throws(() => guardian.parseArgs(['--max-catalog-size', 'abc']), /must be a positive integer/)
})

test('parseArgs accepts --export-inventory-jsonl flag', () => {
  const args = guardian.parseArgs(['--export-inventory-jsonl', 'output.ndjson'])
  assert.strictEqual(args.exportInventoryJsonl, 'output.ndjson')
})

test('parseArgs accepts --selftest flag', () => {
  const args = guardian.parseArgs(['--selftest'])
  assert.strictEqual(args.selftest, true)
})

test('parseArgs accepts --selftest-quiet flag', () => {
  const args = guardian.parseArgs(['--selftest-quiet'])
  assert.strictEqual(args.selftest, true)
  assert.strictEqual(args.selftestQuiet, true)
})

test('parseArgs defaults are correct for new fields', () => {
  const args = guardian.parseArgs([])
  assert.strictEqual(args.profile, 'legacy')
  assert.deepStrictEqual(args.roots, [])
  assert.strictEqual(args.listRoots, false)
  assert.strictEqual(args.allUsers, false)
  assert.strictEqual(args.exposureCatalog, null)
  assert.strictEqual(args.offlineExposureOnly, false)
  assert.strictEqual(args.maxCatalogSize, DEFAULT_MAX_CATALOG_SIZE)
  assert.strictEqual(args.exportInventoryJsonl, null)
  assert.strictEqual(args.selftest, false)
  assert.strictEqual(args.selftestQuiet, false)
})

test('applyBaseline normalizes ecosystem casing for vscode', () => {
  const findings = [
    { ecosystem: 'vscode', package: 'test-ext', version: '1.0.0', advisory_id: 'GHSA-test', found_in: [] }
  ]
  const baseline = [
    { ecosystem: 'VSCode', package: 'test-ext', version: '1.0.0', advisory_id: 'GHSA-test', status: 'active' }
  ]
  const { findings: visible, suppressedCount } = applyBaseline(findings, baseline)
  assert.strictEqual(suppressedCount, 1)
  assert.strictEqual(visible.length, 0)
})

test('applyBaseline normalizes ecosystem casing reverse', () => {
  const findings = [
    { ecosystem: 'VSCode', package: 'test-ext', version: '1.0.0', advisory_id: 'GHSA-test', found_in: [] }
  ]
  const baseline = [
    { ecosystem: 'vscode', package: 'test-ext', version: '1.0.0', advisory_id: 'GHSA-test', status: 'active' }
  ]
  const { findings: visible, suppressedCount } = applyBaseline(findings, baseline)
  assert.strictEqual(suppressedCount, 1)
  assert.strictEqual(visible.length, 0)
})

test('normalizeState handles new fields', () => {
  const state = normalizeState({
    profile: 'baseline',
    roots: '/path1,/path2',
    listRoots: true,
    allUsers: true,
    exposureCatalog: 'catalog.json',
    offlineExposureOnly: true,
    exportInventoryJsonl: 'output.ndjson',
    selftest: true
  })
  assert.strictEqual(state.profile, 'baseline')
  assert.deepStrictEqual(state.roots, ['/path1', '/path2'])
  assert.strictEqual(state.listRoots, true)
  assert.strictEqual(state.allUsers, true)
  assert.strictEqual(state.exposureCatalog, 'catalog.json')
  assert.strictEqual(state.offlineExposureOnly, true)
  assert.strictEqual(state.exportInventoryJsonl, 'output.ndjson')
  assert.strictEqual(state.selftest, true)
})

test('validateState validates profile', () => {
  const { errors } = validateState({ profile: 'invalid', ecosystems: ['npm'] })
  assert.ok(errors.some((e) => e.includes('profile')))
})

test('validateState accepts valid profile', () => {
  const { errors } = validateState({ profile: 'baseline', ecosystems: ['npm'] })
  assert.ok(!errors.some((e) => e.includes('profile')))
})

test('buildCommand includes --profile flag', () => {
  const cmd = buildCommand({ profile: 'baseline', ecosystems: ['npm'] })
  assert.ok(cmd.includes('--profile'))
  assert.ok(cmd.includes('baseline'))
})

test('buildCommand includes --root flags', () => {
  const cmd = buildCommand({ roots: ['/path1', '/path2'], ecosystems: ['npm'] })
  assert.ok(cmd.includes('--root'))
})

test('buildCommand includes --exposure-catalog flag', () => {
  const cmd = buildCommand({ exposureCatalog: 'catalog.json', ecosystems: ['npm'] })
  assert.ok(cmd.includes('--exposure-catalog'))
  assert.ok(cmd.includes('catalog.json'))
})

test('buildCommand includes --offline-exposure-only flag', () => {
  const cmd = buildCommand({ offlineExposureOnly: true, ecosystems: ['npm'] })
  assert.ok(cmd.includes('--offline-exposure-only'))
})

test('buildCommand includes --export-inventory-jsonl flag', () => {
  const cmd = buildCommand({ exportInventoryJsonl: 'output.ndjson', ecosystems: ['npm'] })
  assert.ok(cmd.includes('--export-inventory-jsonl'))
})

test('buildCommand includes --selftest flag', () => {
  const cmd = buildCommand({ selftest: true, ecosystems: ['npm'] })
  assert.ok(cmd.includes('--selftest'))
})

test('runSelftest passes all checks', async () => {
  const result = await runSelftest({ selftestQuiet: true })
  assert.strictEqual(result.exitCode, 0)
  assert.ok(result.passed > 0)
  assert.strictEqual(result.failed, 0)
})

test('writeInventoryJsonl writes valid NDJSON', async () => {
  await withTempDir(async (tmpDir) => {
    const outFile = path.join(tmpDir, 'inventory.ndjson')
    const packageMap = new Map()
    packageMap.set('npm|lodash|4.17.21', {
      ecosystem: 'npm',
      name: 'lodash',
      version: '4.17.21',
      paths: ['/test'],
      occurrences: []
    })

    const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
    scanContext.status = 'complete'
    scanContext.result = {
      packageCount: 1,
      findings: [{
        ecosystem: 'npm',
        package: 'lodash',
        version: '4.17.21',
        advisory_id: 'GHSA-test',
        severity: 'high',
        source: 'osv'
      }],
      exitCode: 1,
      policy: null
    }

    const result = await writeInventoryJsonl(packageMap, { exportInventoryJsonl: outFile }, scanContext)
    assert.strictEqual(result, outFile)

    const content = await fsp.readFile(outFile, 'utf8')
    const lines = content.trim().split('\n')
    assert.ok(lines.length >= 3)

    for (const line of lines) {
      const record = JSON.parse(line)
      assert.ok(record.record_type)
      assert.ok(record.record_id)
      assert.ok(record.run_id)
    }

    const packageRecords = lines.filter((l) => JSON.parse(l).record_type === 'package')
    const findingRecords = lines.filter((l) => JSON.parse(l).record_type === 'finding')
    const summaryRecords = lines.filter((l) => JSON.parse(l).record_type === 'scan_summary')

    assert.strictEqual(packageRecords.length, 1)
    assert.strictEqual(findingRecords.length, 1)
    assert.strictEqual(summaryRecords.length, 1)
  })
})

test('writeInventoryJsonl returns null when no output file specified', async () => {
  const packageMap = new Map()
  const result = await writeInventoryJsonl(packageMap, { exportInventoryJsonl: null }, {})
  assert.strictEqual(result, null)
})

test('execTool is exported from resolve/shared', () => {
  const shared = require('./src/resolve/shared')
  assert.ok(typeof shared.execTool === 'function')
  assert.ok(typeof shared.createGraphPackage === 'function')
})

test('createGraphPackage creates valid package', () => {
  const shared = require('./src/resolve/shared')
  const pkg = shared.createGraphPackage('npm', 'lodash', '4.17.21', ['root', 'lodash@4.17.21'], 1)
  assert.strictEqual(pkg.key, 'npm|lodash|4.17.21')
  assert.strictEqual(pkg.name, 'lodash')
  assert.strictEqual(pkg.version, '4.17.21')
  assert.strictEqual(pkg.ecosystem, 'npm')
  assert.strictEqual(pkg.resolution_mode, 'graph')
  assert.strictEqual(pkg.depth, 1)
})

test('UI_MANIFEST includes new fields', () => {
  const { UI_MANIFEST } = require('./src/ui/manifest')
  const targetSection = UI_MANIFEST.sections.find((s) => s.id === 'target')
  assert.ok(targetSection.fields.some((f) => f.key === 'profile'))
  assert.ok(targetSection.fields.some((f) => f.key === 'roots'))
  assert.ok(targetSection.fields.some((f) => f.key === 'listRoots'))
  assert.ok(targetSection.fields.some((f) => f.key === 'allUsers'))

  const outputSection = UI_MANIFEST.sections.find((s) => s.id === 'output')
  assert.ok(outputSection.fields.some((f) => f.key === 'exportInventoryJsonl'))
  assert.ok(outputSection.fields.some((f) => f.key === 'exposureCatalog'))
  assert.ok(outputSection.fields.some((f) => f.key === 'offlineExposureOnly'))

  const advancedSection = UI_MANIFEST.sections.find((s) => s.id === 'advanced')
  assert.ok(advancedSection.fields.some((f) => f.key === 'selftest'))
})

test('loadExposureCatalog loads valid JSON file', async () => {
  await withTempDir(async (tmpDir) => {
    const catalogFile = path.join(tmpDir, 'catalog.json')
    const catalog = {
      schema_version: '0.1.0',
      entries: [
        { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' }
      ]
    }
    await fsp.writeFile(catalogFile, JSON.stringify(catalog), 'utf8')

    const result = await loadExposureCatalog(catalogFile)
    assert.strictEqual(result.entries.length, 1)
    assert.strictEqual(result.index.size, 1)
    assert.ok(result.index.has('npm|lodash|4.17.20'))
    assert.strictEqual(result.schemaVersion, '0.1.0')
  })
})

test('loadExposureCatalog loads from directory', async () => {
  await withTempDir(async (tmpDir) => {
    const catalog1 = {
      schema_version: '0.1.0',
      entries: [{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'high' }]
    }
    const catalog2 = {
      schema_version: '0.1.0',
      entries: [{ id: 'adv-2', ecosystem: 'npm', package: 'express', versions: ['4.18.0'], severity: 'critical' }]
    }
    await fsp.writeFile(path.join(tmpDir, 'cat1.json'), JSON.stringify(catalog1), 'utf8')
    await fsp.writeFile(path.join(tmpDir, 'cat2.json'), JSON.stringify(catalog2), 'utf8')

    const result = await loadExposureCatalog(tmpDir)
    assert.strictEqual(result.entries.length, 2)
    assert.strictEqual(result.index.size, 2)
  })
})

test('loadExposureCatalog rejects missing file', async () => {
  await assert.rejects(
    () => loadExposureCatalog('/nonexistent/catalog.json'),
    /not found/
  )
})

test('loadExposureCatalog rejects file exceeding max size', async () => {
  await withTempDir(async (tmpDir) => {
    const catalogFile = path.join(tmpDir, 'catalog.json')
    const catalog = { schema_version: '0.1.0', entries: [] }
    await fsp.writeFile(catalogFile, JSON.stringify(catalog), 'utf8')

    await assert.rejects(
      () => loadExposureCatalog(catalogFile, { maxCatalogSize: 2 }),
      /exceeds max size/
    )
  })
})

test('runSelftest reports results', async () => {
  const result = await runSelftest({ selftestQuiet: true })
  assert.ok(typeof result.passed === 'number')
  assert.ok(typeof result.failed === 'number')
  assert.ok(Array.isArray(result.results))
  assert.ok(result.results.length > 0)
  assert.ok(result.results.every((r) => r.name && typeof r.ok === 'boolean'))
})
