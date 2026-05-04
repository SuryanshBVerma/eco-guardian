'use strict'

const os = require('os')
const {
  VERSION,
  SEVERITY_ORDER,
  SUPPORTED_ECOSYSTEMS
} = require('../config/constants')

function parseEcosystemList (value) {
  const list = value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (list.length === 0) throw new Error('Empty ecosystem list')
  if (list.length === 1 && list[0] === 'scan-all') {
    return SUPPORTED_ECOSYSTEMS.slice()
  }
  for (const item of list) {
    if (!SUPPORTED_ECOSYSTEMS.includes(item)) {
      throw new Error(`Unsupported ecosystem: ${item}`)
    }
  }
  return list
}

function printUsage () {
  process.stdout.write(`eco-guardian v${VERSION}\n`)
  process.stdout.write('Usage:\n  node eco-guardian.js [flags]\n\n')
  process.stdout.write('Flags:\n')
  process.stdout.write(
    '  --path <dir>         Scan specific directory (default: home directory)\n'
  )
  process.stdout.write(
    '  --global-only        Only scan global npm installs\n'
  )
  process.stdout.write(
    '  --ecosystems <list>  Comma-separated ecosystems: npm,maven,gradle,nuget,vscode,python,go,ruby,rust,php,dart,elixir,conan,haskell,swift,r or scan-all (default: npm)\n'
  )
  process.stdout.write(
    '  --graph-resolution   Resolve dependency graphs using ecosystem-specific native tools\n'
  )
  process.stdout.write(
    '  --ui                 Launch a local command-builder UI\n'
  )
  process.stdout.write(
    '  --gradle-task <task>  Gradle dependencies task to run, such as :app:dependencies\n'
  )
  process.stdout.write(
    '  --dependency-check-mode  Compatibility alias for --nvd-mode on\n'
  )
  process.stdout.write(
    '  --nvd-mode <mode>  NVD enrichment mode for Java ecosystems: auto|on|off (default: auto)\n'
  )
  process.stdout.write('  --no-nvd           Disable NVD enrichment\n')
  process.stdout.write(
    '  --nvd-api-key <key>  NVD API key (optional, also reads NVD_API_KEY env)\n'
  )
  process.stdout.write(
    '  --severity <level>   Minimum: low|moderate|high|critical (default: low)\n'
  )
  process.stdout.write(
    '  --json               Output only JSON findings to stdout\n'
  )
  process.stdout.write(
    '  --banner <on|off>    Control CLI chrome (default: on)\n'
  )
  process.stdout.write('  --no-cache           Disable cache read/write\n')
  process.stdout.write(
    '  --fix                Write fix script (npm, maven, nuget, python, go, ruby, rust, php, dart, elixir, r)\n'
  )
  process.stdout.write(
    '  --export-txt <file>  Export findings to TXT report\n'
  )
  process.stdout.write(
    '  --export-html <file> Export findings to HTML report\n'
  )
  process.stdout.write(
    '  --export-sarif <file> Export findings to SARIF 2.1.0\n'
  )
  process.stdout.write(
    '  --export-json <file>  Export findings to JSON file\n'
  )
  process.stdout.write('  --export-csv <file>   Export findings to CSV file\n')
  process.stdout.write('  --baseline <file>    Apply baseline / ignore file\n')
  process.stdout.write(
    '  --write-baseline <file> Write current findings to a baseline file\n'
  )
  process.stdout.write(
    '  --strict-baseline    Fail when explicit baseline file is missing/invalid\n'
  )
  process.stdout.write(
    '  --fail-on-severity <level>  Fail policy when any finding is >= level\n'
  )
  process.stdout.write(
    '  --max-critical <n>   Fail policy when critical findings exceed n\n'
  )
  process.stdout.write(
    '  --max-high <n>       Fail policy when high findings exceed n\n'
  )
  process.stdout.write(
    '  --why <package>      Explain why a package is present and how to fix it\n'
  )
  process.stdout.write(
    '  --benchmark          Show real-time RAM/CPU usage during scan\n'
  )
  process.stdout.write(
    '  --watch              Run eco-guardian as a long-lived incremental monitor\n'
  )
  process.stdout.write(
    '  --notify-on-severity <level> Notify on new findings at or above this severity (default: high)\n'
  )
  process.stdout.write(
    '  --state-file <file>  Persistent watch-state snapshot file\n'
  )
  process.stdout.write(
    '  --alerts-file <file> Append-only JSONL alert ledger (default: eco-guardian-alerts.jsonl)\n'
  )
  process.stdout.write(
    '  --alerts-md <file>   Human-readable Markdown alert digest\n'
  )
  process.stdout.write(
    '  --reconcile-interval <sec> Low-frequency safety sweep interval (default: 900)\n'
  )
  process.stdout.write(
    '  --watch-debounce-ms <ms> Debounce interval before rescanning dirty projects (default: 1500)\n'
  )
  process.stdout.write('  --help               Show this help\n')
  process.stdout.write('  --version            Show version\n')
  process.stdout.write('  --global             Include / root scan on Unix\n')
  process.stdout.write(
    '  --all-drives         Alias for full-disk opt-in behavior\n'
  )
}

function parseArgs (argv) {
  const {
    DEFAULT_WATCH_STATE_FILE,
    DEFAULT_ALERTS_FILE,
    DEFAULT_NOTIFY_SEVERITY,
    DEFAULT_RECONCILE_INTERVAL_SEC,
    DEFAULT_WATCH_DEBOUNCE_MS
  } = require('../config/constants')

  const args = {
    path: os.homedir(),
    pathExplicit: false,
    globalOnly: false,
    ecosystems: ['npm'],
    graphResolution: false,
    ui: false,
    gradleTask: null,
    dependencyCheckMode: false,
    nvdMode: 'auto',
    nvdApiKey: null,
    severity: 'low',
    json: false,
    banner: 'on',
    noCache: false,
    fix: false,
    exportTxt: null,
    exportHtml: null,
    exportSarif: null,
    exportJson: null,
    exportCsv: null,
    baseline: null,
    baselineExplicit: false,
    writeBaseline: null,
    strictBaseline: false,
    failOnSeverity: null,
    maxCritical: null,
    maxHigh: null,
    why: null,
    help: false,
    version: false,
    global: false,
    allDrives: false,
    verbose: false,
    benchmark: false,
    seek: null,
    echo: null,
    watch: false,
    notifyOnSeverity: DEFAULT_NOTIFY_SEVERITY,
    stateFile: null,
    alertsFile: DEFAULT_ALERTS_FILE,
    alertsMd: null,
    reconcileInterval: DEFAULT_RECONCILE_INTERVAL_SEC,
    watchDebounceMs: DEFAULT_WATCH_DEBOUNCE_MS
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--path') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --path')
      }
      args.path = next
      args.pathExplicit = true
      i += 1
      continue
    }
    if (token === '--severity') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --severity')
      }
      const normalized = String(next).toLowerCase()
      if (!Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, normalized)) {
        throw new Error('Invalid severity. Use: low, moderate, high, critical')
      }
      args.severity = normalized
      i += 1
      continue
    }
    if (token === '--global-only') {
      args.globalOnly = true
      continue
    }
    if (token === '--ecosystems') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --ecosystems')
      }
      args.ecosystems = parseEcosystemList(next)
      i += 1
      continue
    }
    if (token === '--json') {
      args.json = true
      continue
    }
    if (token === '--banner') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --banner')
      }
      const normalized = String(next).toLowerCase()
      if (normalized !== 'on' && normalized !== 'off') {
        throw new Error('Invalid --banner. Use: on, off')
      }
      args.banner = normalized
      i += 1
      continue
    }
    if (token === '--no-cache') {
      args.noCache = true
      continue
    }
    if (token === '--fix') {
      args.fix = true
      continue
    }
    if (token === '--export-txt') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.exportTxt = next
      i += 1
      continue
    }
    if (token === '--export-html') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --export-html')
      }
      args.exportHtml = next
      i += 1
      continue
    }
    if (token === '--export-sarif') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --export-sarif')
      }
      args.exportSarif = next
      i += 1
      continue
    }
    if (token === '--export-json') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --export-json')
      }
      args.exportJson = next
      i += 1
      continue
    }
    if (token === '--export-csv') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --export-csv')
      }
      args.exportCsv = next
      i += 1
      continue
    }
    if (token === '--baseline') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --baseline')
      }
      args.baseline = next
      args.baselineExplicit = true
      i += 1
      continue
    }
    if (token === '--write-baseline') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --write-baseline')
      }
      args.writeBaseline = next
      i += 1
      continue
    }
    if (token === '--strict-baseline') {
      args.strictBaseline = true
      continue
    }
    if (token === '--fail-on-severity') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --fail-on-severity')
      }
      const normalized = String(next).toLowerCase()
      if (!Object.prototype.hasOwnProperty.call(SEVERITY_ORDER, normalized)) {
        throw new Error(
          'Invalid --fail-on-severity. Use: low, moderate, high, critical'
        )
      }
      args.failOnSeverity = normalized
      i += 1
      continue
    }
    if (token === '--max-critical') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --max-critical')
      }
      const parsed = Number(next)
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error('--max-critical must be a non-negative integer')
      }
      args.maxCritical = parsed
      i += 1
      continue
    }
    if (token === '--max-high') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --max-high')
      }
      const parsed = Number(next)
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error('--max-high must be a non-negative integer')
      }
      args.maxHigh = parsed
      i += 1
      continue
    }
    if (token === '--why') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --why')
      }
      args.why = next
      i += 1
      continue
    }
    if (token === '--help') {
      args.help = true
      continue
    }
    if (token === '--version') {
      args.version = true
      continue
    }
    if (token === '--global') {
      args.global = true
      continue
    }
    if (token === '--all-drives') {
      args.allDrives = true
      continue
    }
    if (token === '--verbose') {
      args.verbose = true
      continue
    }
    if (token === '--benchmark') {
      args.benchmark = true
      continue
    }
    if (token === '--graph-resolution') {
      args.graphResolution = true
      continue
    }
    if (token === '--ui') {
      args.ui = true
      continue
    }
    if (token === '--gradle-task') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --gradle-task')
      }
      args.gradleTask = next
      i += 1
      continue
    }
    if (token === '--dependency-check-mode') {
      args.dependencyCheckMode = true
      args.nvdMode = 'on'
      continue
    }
    if (token === '--nvd-mode') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --nvd-mode')
      }
      const normalized = String(next).toLowerCase()
      if (!['auto', 'on', 'off'].includes(normalized)) {
        throw new Error('Invalid --nvd-mode. Use: auto, on, off')
      }
      args.nvdMode = normalized
      i += 1
      continue
    }
    if (token === '--no-nvd') {
      args.nvdMode = 'off'
      continue
    }
    if (token === '--nvd-api-key') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --nvd-api-key')
      }
      args.nvdApiKey = next
      i += 1
      continue
    }
    if (token === '--watch') {
      args.watch = true
      continue
    }
    if (token === '--notify-on-severity') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.notifyOnSeverity = String(next).toLowerCase()
      i += 1
      continue
    }
    if (token === '--state-file') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.stateFile = next
      i += 1
      continue
    }
    if (token === '--alerts-file') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.alertsFile = next
      i += 1
      continue
    }
    if (token === '--alerts-md') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.alertsMd = next
      i += 1
      continue
    }
    if (token === '--reconcile-interval') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.reconcileInterval = Number(next)
      i += 1
      continue
    }
    if (token === '--watch-debounce-ms') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${token}`)
      }
      args.watchDebounceMs = Number(next)
      i += 1
      continue
    }
    if (token === '--seek') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --seek')
      }
      args.seek = next
      i += 1
      continue
    }
    if (token === '--echo') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --echo')
      }
      args.echo = next
      i += 1
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }

  if (args.watch && !args.stateFile) {
    args.stateFile = DEFAULT_WATCH_STATE_FILE
  }

  return args
}

module.exports = {
  printUsage,
  parseArgs,
  parseEcosystemList
}
