'use strict'

const os = require('os')
const path = require('path')
const fsp = require('fs/promises')
const { VERSION } = require('../config/constants')
const { parseExposureCatalog, buildCatalogIndex } = require('../exposure/catalog')
const { matchExposureCatalog } = require('../exposure/match')
const { newRunId, createScanContext, stablePackageId, stableFindingId, stableSummaryId } = require('../shared/ids')
const { classifyRoot, isBroadRoot } = require('../scan/roots')

async function withTempDir (fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'eco-guardian-selftest-'))
  try {
    return await fn(root)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
}

function assert (condition, message) {
  if (!condition) {
    throw new Error(`Selftest failed: ${message}`)
  }
}

async function runSelftest (options = {}) {
  const quiet = options.selftestQuiet || false
  const results = []
  let passed = 0
  let failed = 0

  function logResult (name, ok, err) {
    if (ok) {
      passed++
      if (!quiet) process.stdout.write(`  [OK] ${name}\n`)
    } else {
      failed++
      process.stderr.write(`  [FAIL] ${name}: ${err}\n`)
    }
    results.push({ name, ok, error: err || null })
  }

  if (!quiet) process.stdout.write(`\neco-guardian v${VERSION} selftest\n\n`)

  try {
    if (!quiet) process.stdout.write('[1] Stable ID tests\n')

    try {
      const id1 = newRunId()
      const id2 = newRunId()
      assert(typeof id1 === 'string' && id1.startsWith('run_'), 'newRunId format')
      assert(id1 !== id2, 'newRunId uniqueness')
      logResult('newRunId generates unique IDs', true)
    } catch (err) {
      logResult('newRunId generates unique IDs', false, err.message)
    }

    try {
      const context = { runId: 'test_run_1' }
      const pkg = { ecosystem: 'npm', name: 'lodash', version: '4.17.21' }
      const id = stablePackageId(pkg, context)
      assert(typeof id === 'string' && id.startsWith('pkg:'), 'stablePackageId format')
      const id2 = stablePackageId(pkg, { runId: 'test_run_2' })
      assert(id === id2, 'stablePackageId cross-run determinism')
      logResult('stablePackageId is deterministic', true)
    } catch (err) {
      logResult('stablePackageId is deterministic', false, err.message)
    }

    try {
      const context = { runId: 'test_run_1' }
      const finding = { ecosystem: 'npm', package: 'lodash', version: '4.17.21', advisory_id: 'GHSA-test' }
      const id = stableFindingId(finding, context)
      assert(typeof id === 'string' && id.startsWith('finding:'), 'stableFindingId format')
      const id2 = stableFindingId(finding, { runId: 'test_run_2' })
      assert(id === id2, 'stableFindingId cross-run determinism')
      logResult('stableFindingId format', true)
    } catch (err) {
      logResult('stableFindingId format', false, err.message)
    }

    try {
      const context = { runId: 'test_run_1', packageCount: 10, findingCount: 2 }
      const id = stableSummaryId(context)
      assert(typeof id === 'string' && id.startsWith('summary:'), 'stableSummaryId format')
      logResult('stableSummaryId format', true)
    } catch (err) {
      logResult('stableSummaryId format', false, err.message)
    }

    try {
      const options = { profile: 'baseline', ecosystems: ['npm'] }
      const context = createScanContext(options)
      assert(context.runId && context.runId.startsWith('run_'), 'createScanContext runId')
      assert(context.schemaVersion === '0.1.0', 'createScanContext schemaVersion')
      assert(context.profile === 'baseline', 'createScanContext profile')
      assert(context.startedAt, 'createScanContext startedAt')
      logResult('createScanContext creates valid context', true)
    } catch (err) {
      logResult('createScanContext creates valid context', false, err.message)
    }
  } catch (err) {
    logResult('ID tests suite', false, err.message)
  }

  try {
    if (!quiet) process.stdout.write('\n[2] Exposure catalog tests\n')

    try {
      const raw = JSON.stringify({
        schema_version: '0.1.0',
        entries: [
          {
            id: 'test-001',
            name: 'Test advisory',
            ecosystem: 'npm',
            package: 'lodash',
            versions: ['4.17.20'],
            severity: 'high'
          }
        ]
      })
      const catalog = parseExposureCatalog(raw)
      assert(catalog.schema_version === '0.1.0', 'parseExposureCatalog schema_version')
      assert(catalog.entries.length === 1, 'parseExposureCatalog entries')
      logResult('parseExposureCatalog parses valid catalog', true)
    } catch (err) {
      logResult('parseExposureCatalog parses valid catalog', false, err.message)
    }

    try {
      const raw = JSON.stringify({ schema_version: '0.1.0', entries: [] })
      const catalog = parseExposureCatalog(raw)
      const index = buildCatalogIndex(catalog.entries)
      assert(index.size === 0, 'buildCatalogIndex empty')
      logResult('buildCatalogIndex handles empty entries', true)
    } catch (err) {
      logResult('buildCatalogIndex handles empty entries', false, err.message)
    }

    try {
      const entries = [
        { id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20', '4.17.21'], severity: 'high' }
      ]
      const index = buildCatalogIndex(entries)
      assert(index.size === 2, 'buildCatalogIndex size')
      assert(index.has('npm|lodash|4.17.20'), 'buildCatalogIndex key 1')
      assert(index.has('npm|lodash|4.17.21'), 'buildCatalogIndex key 2')
      logResult('buildCatalogIndex indexes all versions', true)
    } catch (err) {
      logResult('buildCatalogIndex indexes all versions', false, err.message)
    }

    try {
      const bad = JSON.stringify({ entries: [] })
      let threw = false
      try {
        parseExposureCatalog(bad)
      } catch (err) {
        threw = true
        assert(err.message.includes('schema_version'), 'validation error message')
      }
      assert(threw, 'parseExposureCatalog should reject missing schema_version')
      logResult('parseExposureCatalog rejects invalid catalog', true)
    } catch (err) {
      logResult('parseExposureCatalog rejects invalid catalog', false, err.message)
    }

    try {
      const packageMap = new Map()
      packageMap.set('npm|lodash|4.17.20', {
        ecosystem: 'npm',
        name: 'lodash',
        version: '4.17.20',
        paths: ['/test'],
        occurrences: [{ project: 'test', manifest_path: '/test/package.json', dependency_type: 'direct' }]
      })
      packageMap.set('npm|safe-pkg|1.0.0', {
        ecosystem: 'npm',
        name: 'safe-pkg',
        version: '1.0.0',
        paths: ['/test'],
        occurrences: []
      })

      const catalog = {
        entries: [{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'critical' }],
        index: buildCatalogIndex([{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'critical' }])
      }

      const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
      const { matchExposureCatalog } = require('../exposure/match')
      const findings = matchExposureCatalog(packageMap, catalog, {}, scanContext)
      assert(findings.length === 1, 'matchExposureCatalog finds match')
      assert(findings[0].package === 'lodash', 'matchExposureCatalog correct package')
      assert(findings[0].source === 'exposure-catalog', 'matchExposureCatalog source')
      assert(findings[0].finding_id, 'matchExposureCatalog has finding_id')
      logResult('matchExposureCatalog matches vulnerable package', true)
    } catch (err) {
      logResult('matchExposureCatalog matches vulnerable package', false, err.message)
    }

    try {
      const packageMap = new Map()
      packageMap.set('npm|safe-pkg|1.0.0', {
        ecosystem: 'npm',
        name: 'safe-pkg',
        version: '1.0.0',
        paths: ['/test'],
        occurrences: []
      })

      const catalog = {
        entries: [{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'critical' }],
        index: buildCatalogIndex([{ id: 'adv-1', ecosystem: 'npm', package: 'lodash', versions: ['4.17.20'], severity: 'critical' }])
      }

      const findings = matchExposureCatalog(packageMap, catalog, {}, null)
      assert(findings.length === 0, 'matchExposureCatalog finds no match')
      logResult('matchExposureCatalog returns empty for no match', true)
    } catch (err) {
      logResult('matchExposureCatalog returns empty for no match', false, err.message)
    }
  } catch (err) {
    logResult('Exposure catalog tests suite', false, err.message)
  }

  try {
    if (!quiet) process.stdout.write('\n[3] Root classification tests\n')

    try {
      const home = os.homedir()
      assert(classifyRoot(home, 'legacy') === 'user_package_root', 'classifyRoot home')
      assert(classifyRoot('/deep/scan', 'deep') === 'unknown', 'classifyRoot unknown path')
      logResult('classifyRoot classifies paths correctly', true)
    } catch (err) {
      logResult('classifyRoot classifies paths correctly', false, err.message)
    }

    try {
      assert(isBroadRoot(os.homedir()) === true, 'isBroadRoot home')
      assert(isBroadRoot('/some/project') === false, 'isBroadRoot project')
      logResult('isBroadRoot detects broad roots', true)
    } catch (err) {
      logResult('isBroadRoot detects broad roots', false, err.message)
    }
  } catch (err) {
    logResult('Root classification tests suite', false, err.message)
  }

  try {
    if (!quiet) process.stdout.write('\n[4] Inventory JSONL record tests\n')

    try {
      const { buildPackageRecord, buildFindingRecord, buildScanSummaryRecord } = require('../report/inventory-jsonl')
      const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })

      const pkg = { ecosystem: 'npm', name: 'lodash', version: '4.17.21', paths: ['/test'], occurrences: [] }
      const record = buildPackageRecord(pkg, scanContext)
      assert(record.record_type === 'package', 'buildPackageRecord record_type')
      assert(record.record_id && record.record_id.startsWith('pkg:'), 'buildPackageRecord record_id')
      assert(record.run_id === scanContext.runId, 'buildPackageRecord run_id')
      assert(record.ecosystem === 'npm', 'buildPackageRecord ecosystem')
      logResult('buildPackageRecord creates valid record', true)
    } catch (err) {
      logResult('buildPackageRecord creates valid record', false, err.message)
    }

    try {
      const { buildFindingRecord } = require('../report/inventory-jsonl')
      const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })

      const finding = { ecosystem: 'npm', package: 'lodash', version: '4.17.21', advisory_id: 'GHSA-test', severity: 'high', source: 'osv' }
      const record = buildFindingRecord(finding, scanContext)
      assert(record.record_type === 'finding', 'buildFindingRecord record_type')
      assert(record.record_id && record.record_id.startsWith('finding:'), 'buildFindingRecord record_id')
      assert(record.severity === 'high', 'buildFindingRecord severity')
      logResult('buildFindingRecord creates valid record', true)
    } catch (err) {
      logResult('buildFindingRecord creates valid record', false, err.message)
    }

    try {
      const { buildScanSummaryRecord } = require('../report/inventory-jsonl')
      const scanContext = createScanContext({ profile: 'baseline', ecosystems: ['npm'] })
      scanContext.status = 'complete'

      const result = { packageCount: 100, findings: [{ severity: 'high' }], exitCode: 1, policy: null }
      const record = buildScanSummaryRecord(scanContext, result)
      assert(record.record_type === 'scan_summary', 'buildScanSummaryRecord record_type')
      assert(record.package_count === 100, 'buildScanSummaryRecord package_count')
      assert(record.finding_count === 1, 'buildScanSummaryRecord finding_count')
      logResult('buildScanSummaryRecord creates valid record', true)
    } catch (err) {
      logResult('buildScanSummaryRecord creates valid record', false, err.message)
    }
  } catch (err) {
    logResult('Inventory JSONL tests suite', false, err.message)
  }

  try {
    if (!quiet) process.stdout.write('\n[5] CLI argument parsing tests\n')

    try {
      const { parseArgs } = require('../cli/args')
      const args = parseArgs(['--profile', 'baseline'])
      assert(args.profile === 'baseline', 'parseArgs --profile baseline')
      logResult('parseArgs --profile flag', true)
    } catch (err) {
      logResult('parseArgs --profile flag', false, err.message)
    }

    try {
      const { parseArgs } = require('../cli/args')
      const args = parseArgs(['--root', '/test/path', '--root', '/test/path2'])
      assert(args.roots.length === 2, 'parseArgs --root count')
      assert(args.roots[0] === '/test/path', 'parseArgs --root first')
      logResult('parseArgs --root repeatable flag', true)
    } catch (err) {
      logResult('parseArgs --root repeatable flag', false, err.message)
    }

    try {
      const { parseArgs } = require('../cli/args')
      const args = parseArgs(['--list-roots'])
      assert(args.listRoots === true, 'parseArgs --list-roots')
      logResult('parseArgs --list-roots flag', true)
    } catch (err) {
      logResult('parseArgs --list-roots flag', false, err.message)
    }

    try {
      const { parseArgs } = require('../cli/args')
      const args = parseArgs(['--exposure-catalog', 'catalog.json'])
      assert(args.exposureCatalog === 'catalog.json', 'parseArgs --exposure-catalog')
      logResult('parseArgs --exposure-catalog flag', true)
    } catch (err) {
      logResult('parseArgs --exposure-catalog flag', false, err.message)
    }

    try {
      const { parseArgs } = require('../cli/args')
      const args = parseArgs(['--selftest'])
      assert(args.selftest === true, 'parseArgs --selftest')
      logResult('parseArgs --selftest flag', true)
    } catch (err) {
      logResult('parseArgs --selftest flag', false, err.message)
    }

    try {
      const { parseArgs } = require('../cli/args')
      const args = parseArgs(['--export-inventory-jsonl', 'output.ndjson'])
      assert(args.exportInventoryJsonl === 'output.ndjson', 'parseArgs --export-inventory-jsonl')
      logResult('parseArgs --export-inventory-jsonl flag', true)
    } catch (err) {
      logResult('parseArgs --export-inventory-jsonl flag', false, err.message)
    }

    try {
      const { parseArgs } = require('../cli/args')
      let threw = false
      try {
        parseArgs(['--profile', 'invalid'])
      } catch (err) {
        threw = true
      }
      assert(threw, 'parseArgs should reject invalid profile')
      logResult('parseArgs rejects invalid profile', true)
    } catch (err) {
      logResult('parseArgs rejects invalid profile', false, err.message)
    }
  } catch (err) {
    logResult('CLI parsing tests suite', false, err.message)
  }

  try {
    if (!quiet) process.stdout.write('\n[6] Baseline ecosystem normalization tests\n')

    try {
      const { applyBaseline } = require('../baseline')
      const findings = [
        { ecosystem: 'vscode', package: 'test-ext', version: '1.0.0', advisory_id: 'GHSA-test', found_in: [] }
      ]
      const baseline = [
        { ecosystem: 'VSCode', package: 'test-ext', version: '1.0.0', advisory_id: 'GHSA-test', status: 'active' }
      ]
      const { findings: visible, suppressedCount } = applyBaseline(findings, baseline)
      assert(suppressedCount === 1, 'baseline normalization suppresses VSCode finding')
      assert(visible.length === 0, 'baseline normalization hides VSCode finding')
      logResult('Baseline normalizes VSCode/vscode ecosystem casing', true)
    } catch (err) {
      logResult('Baseline normalizes VSCode/vscode ecosystem casing', false, err.message)
    }
  } catch (err) {
    logResult('Baseline normalization tests suite', false, err.message)
  }

  if (!quiet) {
    process.stdout.write(`\nSelftest results: ${passed} passed, ${failed} failed\n`)
  }

  return {
    passed,
    failed,
    exitCode: failed > 0 ? 1 : 0,
    results
  }
}

module.exports = {
  runSelftest
}
