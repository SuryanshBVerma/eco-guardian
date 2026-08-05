(function () {
  // ── inlined constants from src/config/constants.js ────────────────────────
  const SUPPORTED_ECOSYSTEMS = [
    'npm',
    'maven',
    'gradle',
    'nuget',
    'vscode',
    'python',
    'go',
    'ruby',
    'rust',
    'php',
    'dart',
    'elixir',
    'conan',
    'haskell',
    'swift',
    'r'
  ]
  const DEFAULT_ALERTS_FILE = 'eco-guardian-alerts.jsonl'
  const DEFAULT_NOTIFY_SEVERITY = 'high'
  const DEFAULT_RECONCILE_INTERVAL_SEC = 900
  const DEFAULT_WATCH_DEBOUNCE_MS = 1500
  const DEFAULT_WATCH_STATE_FILE = 'eco-guardian-state.json'

  // ── inlined manifest from src/ui/manifest.js ──────────────────────────────
  const UI_MANIFEST = {
    title: 'eco-guardian command builder',
    commandPrefix: 'npx github:boredom1234/eco-guardian',
    sections: [
      {
        id: 'target',
        label: 'Target',
        description: 'Where the scan should run.',
        fields: [
          {
            key: 'path',
            label: 'Scan directory',
            type: 'text',
            placeholder: 'e.g. ~/projects/my-app',
            help: 'Local scans recurse inside this directory. Leave global scan off for local-by-default behavior.',
            showIf: [{ key: 'globalOnly', truthy: false }]
          },
          {
            key: 'globalOnly',
            label: 'Global npm installs only',
            type: 'boolean',
            help: 'Matches --global-only.'
          },
          {
            key: 'ecosystems',
            label: 'Ecosystems',
            type: 'multiselect',
            options: SUPPORTED_ECOSYSTEMS.map(function (value) {
              return { value, label: value }
            }),
            help: 'Matches --ecosystems <list>.'
          },
          {
            key: 'library',
            label: 'Focus library (--lib)',
            type: 'text',
            placeholder: 'npm:lodash',
            help:
              'Matches --library/--lib <ecosystem>:<name>. When set, scan is focused to that one library.'
          },
          {
            key: 'global',
            label: 'Global scan',
            type: 'boolean',
            help: 'Matches --global. Local scan is the default; enable this to scan system roots.'
          },
          {
            key: 'allDrives',
            label: 'All drives (global alias)',
            type: 'boolean',
            help: 'Matches --all-drives. Enables a global scan across all available drives.'
          }
        ]
      },
      {
        id: 'analysis',
        label: 'Analysis',
        description: 'How the scan resolves dependencies.',
        fields: [
          {
            key: 'graphResolution',
            label: 'Resolve dependency graphs',
            type: 'boolean',
            help: 'Matches --graph-resolution.'
          },
          {
            key: 'gradleTask',
            label: 'Gradle task',
            type: 'text',
            placeholder: ':app:dependencies',
            help: 'Matches --gradle-task <task>.',
            showIf: [
              { key: 'graphResolution', truthy: true },
              { ecosystemSelected: 'gradle' }
            ]
          },
          {
            key: 'dependencyCheckMode',
            label: 'Use compatibility alias (--dependency-check-mode)',
            type: 'boolean',
            help: 'Forces --nvd-mode on through the legacy alias.'
          },
          {
            key: 'nvdMode',
            label: 'NVD mode',
            type: 'select',
            options: ['auto', 'on', 'off'].map(function (value) {
              return { value, label: value }
            }),
            help: 'Matches --nvd-mode <auto|on|off> and --no-nvd.'
          },
          {
            key: 'nvdApiKey',
            label: 'NVD API key',
            type: 'text',
            placeholder: 'Optional',
            help: 'Matches --nvd-api-key <key>.',
            showIf: [
              { notEquals: { key: 'nvdMode', value: 'off' } },
              { anyEcosystemSelected: ['maven', 'gradle'] }
            ]
          },
          {
            key: 'severity',
            label: 'Minimum severity',
            type: 'select',
            options: ['low', 'moderate', 'high', 'critical'].map(
              function (value) {
                return { value, label: value }
              }
            ),
            help: 'Matches --severity <level>.'
          }
        ]
      },
      {
        id: 'output',
        label: 'Output',
        description: 'How results are emitted.',
        fields: [
          {
            key: 'json',
            label: 'JSON to stdout',
            type: 'boolean',
            help: 'Matches --json.'
          },
          {
            key: 'banner',
            label: 'CLI chrome',
            type: 'select',
            options: ['on', 'off'].map(function (value) {
              return { value, label: value }
            }),
            help: 'Matches --banner <on|off>.'
          },
          {
            key: 'noCache',
            label: 'Disable cache',
            type: 'boolean',
            help: 'Matches --no-cache.'
          },
          {
            key: 'fix',
            label: 'Write fix script',
            type: 'boolean',
            help: 'Matches --fix.'
          },
          {
            key: 'exportTxt',
            label: 'Export TXT report',
            type: 'text',
            placeholder: 'report.txt',
            help: 'Matches --export-txt <file>.'
          },
          {
            key: 'exportHtml',
            label: 'Export HTML report',
            type: 'text',
            placeholder: 'report.html',
            help: 'Matches --export-html <file>.'
          },
          {
            key: 'exportSarif',
            label: 'Export SARIF report',
            type: 'text',
            placeholder: 'report.sarif',
            help: 'Matches --export-sarif <file>.'
          },
          {
            key: 'exportJson',
            label: 'Export JSON report',
            type: 'text',
            placeholder: 'report.json',
            help: 'Matches --export-json <file>.'
          },
          {
            key: 'exportCsv',
            label: 'Export CSV report',
            type: 'text',
            placeholder: 'report.csv',
            help: 'Matches --export-csv <file>.'
          }
        ]
      },
      {
        id: 'policy',
        label: 'Policy',
        description: 'Baseline and failure gates.',
        fields: [
          {
            key: 'baseline',
            label: 'Baseline file',
            type: 'text',
            placeholder: '.eco-guardian-baseline.json',
            help: 'Matches --baseline <file>.'
          },
          {
            key: 'writeBaseline',
            label: 'Write baseline file',
            type: 'text',
            placeholder: 'baseline.json',
            help: 'Matches --write-baseline <file>.'
          },
          {
            key: 'strictBaseline',
            label: 'Strict baseline handling',
            type: 'boolean',
            help: 'Matches --strict-baseline.'
          },
          {
            key: 'failOnSeverity',
            label: 'Fail on severity',
            type: 'select',
            options: ['', 'low', 'moderate', 'high', 'critical'].map(
              function (value) {
                return { value, label: value || 'none' }
              }
            ),
            help: 'Matches --fail-on-severity <level>.'
          },
          {
            key: 'maxCritical',
            label: 'Max critical findings',
            type: 'number',
            placeholder: '0',
            help: 'Matches --max-critical <n>.'
          },
          {
            key: 'maxHigh',
            label: 'Max high findings',
            type: 'number',
            placeholder: '0',
            help: 'Matches --max-high <n>.'
          },
          {
            key: 'why',
            label: 'Explain package',
            type: 'text',
            placeholder: 'left-pad',
            help: 'Matches --why <package>.'
          }
        ]
      },
      {
        id: 'watch',
        label: 'Watch',
        description: 'Long-lived incremental monitoring.',
        fields: [
          {
            key: 'watch',
            label: 'Enable watch mode',
            type: 'boolean',
            help: 'Matches --watch.'
          },
          {
            key: 'notifyOnSeverity',
            label: 'Notify on severity',
            type: 'select',
            options: ['low', 'moderate', 'high', 'critical'].map(
              function (value) {
                return { value, label: value }
              }
            ),
            help: 'Matches --notify-on-severity <level>.',
            showIf: [{ key: 'watch', truthy: true }]
          },
          {
            key: 'stateFile',
            label: 'Watch state file',
            type: 'text',
            placeholder: 'eco-guardian-state.json',
            help: 'Matches --state-file <file>.',
            showIf: [{ key: 'watch', truthy: true }]
          },
          {
            key: 'alertsFile',
            label: 'Alerts JSONL file',
            type: 'text',
            placeholder: 'eco-guardian-alerts.jsonl',
            help: 'Matches --alerts-file <file>.',
            showIf: [{ key: 'watch', truthy: true }]
          },
          {
            key: 'alertsMd',
            label: 'Alerts Markdown file',
            type: 'text',
            placeholder: 'eco-guardian-alerts.md',
            help: 'Matches --alerts-md <file>.',
            showIf: [{ key: 'watch', truthy: true }]
          },
          {
            key: 'reconcileInterval',
            label: 'Reconcile interval (sec)',
            type: 'number',
            placeholder: '900',
            help: 'Matches --reconcile-interval <sec>.',
            showIf: [{ key: 'watch', truthy: true }]
          },
          {
            key: 'watchDebounceMs',
            label: 'Debounce (ms)',
            type: 'number',
            placeholder: '1500',
            help: 'Matches --watch-debounce-ms <ms>.',
            showIf: [{ key: 'watch', truthy: true }]
          }
        ]
      },
      {
        id: 'advanced',
        label: 'Advanced',
        description: 'Additional non-default runtime switches.',
        fields: [
          {
            key: 'benchmark',
            label: 'Benchmark mode',
            type: 'boolean',
            help: 'Matches --benchmark.'
          },
          {
            key: 'verbose',
            label: 'Verbose output',
            type: 'boolean',
            help: 'Matches --verbose.'
          }
        ]
      }
    ]
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const app = document.getElementById('app')
  const commandEl = document.getElementById('command')
  const statusEl = document.getElementById('status')
  const copyBtn = document.getElementById('copy-btn')
  const state = {}
  const fieldRegistry = new Map()
  let manifest = null
  let refreshTimer = null

  // ── inlined helpers from src/ui/command-builder.js ───────────────────────

  function detectPlatform () {
    if (typeof navigator !== 'undefined') {
      if (/Win/.test(navigator.userAgent || '')) return 'win32'
      if (/Mac/.test(navigator.userAgent || '')) return 'darwin'
    }
    return 'linux'
  }

  function shellQuote (value, platform) {
    platform = platform || detectPlatform()
    const text = String(value == null ? '' : value)
    if (text === '') return "''"
    if (platform === 'win32') {
      return "'" + text.replace(/'/g, "''") + "'"
    }
    return "'" + text.replace(/'/g, "'\\''") + "'"
  }

  function pushFlag (parts, flag, value, platform) {
    platform = platform || detectPlatform()
    if (value == null || value === '') return
    parts.push(flag)
    if (value !== true) {
      parts.push(shellQuote(value, platform))
    }
  }

  function normalizeEcosystems (value) {
    if (Array.isArray(value)) {
      const arr = value
        .map(function (item) {
          return String(item).toLowerCase()
        })
        .filter(Boolean)
      if (arr.length === 1 && arr[0] === 'scan-all') {
        return SUPPORTED_ECOSYSTEMS.slice()
      }
      return arr
    }
    if (typeof value === 'string') {
      const list = value
        .split(',')
        .map(function (item) {
          return item.trim().toLowerCase()
        })
        .filter(Boolean)
      if (list.length === 1 && list[0] === 'scan-all') {
        return SUPPORTED_ECOSYSTEMS.slice()
      }
      return list
    }
    return ['npm']
  }

  function normalizeState (input) {
    const s = {}
    for (const k in input) {
      if (Object.prototype.hasOwnProperty.call(input, k)) s[k] = input[k]
    }
    // path defaults to empty string (no autofill) — KEY CHANGE from server
    s.path = s.path == null ? '' : String(s.path)
    s.globalOnly = Boolean(s.globalOnly)
    s.ecosystems = normalizeEcosystems(s.ecosystems)
    s.library = s.library == null ? null : String(s.library)
    if (
      !s.library &&
      s.libraryTarget &&
      s.libraryTarget.ecosystem &&
      s.libraryTarget.name
    ) {
      s.library = s.libraryTarget.ecosystem + ':' + s.libraryTarget.name
    }
    s.graphResolution = Boolean(s.graphResolution)
    s.gradleTask = s.gradleTask == null ? null : String(s.gradleTask)
    s.dependencyCheckMode = Boolean(s.dependencyCheckMode)
    s.nvdMode = String(s.nvdMode || 'auto').toLowerCase()
    s.nvdApiKey = s.nvdApiKey == null ? null : String(s.nvdApiKey)
    s.severity = String(s.severity || 'low').toLowerCase()
    s.json = Boolean(s.json)
    s.banner = String(s.banner || 'on').toLowerCase()
    s.noCache = Boolean(s.noCache)
    s.fix = Boolean(s.fix)
    s.exportTxt = s.exportTxt == null ? null : String(s.exportTxt)
    s.exportHtml = s.exportHtml == null ? null : String(s.exportHtml)
    s.exportSarif = s.exportSarif == null ? null : String(s.exportSarif)
    s.exportJson = s.exportJson == null ? null : String(s.exportJson)
    s.exportCsv = s.exportCsv == null ? null : String(s.exportCsv)
    s.baseline = s.baseline == null ? null : String(s.baseline)
    s.writeBaseline = s.writeBaseline == null ? null : String(s.writeBaseline)
    s.strictBaseline = Boolean(s.strictBaseline)
    s.failOnSeverity =
      s.failOnSeverity == null ? null : String(s.failOnSeverity).toLowerCase()
    s.maxCritical =
      s.maxCritical == null || s.maxCritical === ''
        ? null
        : Number(s.maxCritical)
    s.maxHigh =
      s.maxHigh == null || s.maxHigh === '' ? null : Number(s.maxHigh)
    s.why = s.why == null ? null : String(s.why)
    s.benchmark = Boolean(s.benchmark)
    s.watch = Boolean(s.watch)
    s.notifyOnSeverity = String(
      s.notifyOnSeverity || DEFAULT_NOTIFY_SEVERITY
    ).toLowerCase()
    s.stateFile = s.stateFile == null ? null : String(s.stateFile)
    s.alertsFile =
      s.alertsFile == null ? DEFAULT_ALERTS_FILE : String(s.alertsFile)
    s.alertsMd = s.alertsMd == null ? null : String(s.alertsMd)
    s.reconcileInterval =
      s.reconcileInterval == null || s.reconcileInterval === ''
        ? DEFAULT_RECONCILE_INTERVAL_SEC
        : Number(s.reconcileInterval)
    s.watchDebounceMs =
      s.watchDebounceMs == null || s.watchDebounceMs === ''
        ? DEFAULT_WATCH_DEBOUNCE_MS
        : Number(s.watchDebounceMs)
    s.global = Boolean(s.global)
    s.allDrives = Boolean(s.allDrives)
    s.verbose = Boolean(s.verbose)
    return s
  }

  function matchesCondition (condition) {
    if (!condition) return true
    if (Array.isArray(condition)) return condition.every(matchesCondition)

    if (Object.prototype.hasOwnProperty.call(condition, 'key')) {
      const value = state[condition.key]
      if (Object.prototype.hasOwnProperty.call(condition, 'truthy')) {
        return Boolean(value) === condition.truthy
      }
      if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
        return value === condition.equals
      }
      if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
        return value !== condition.notEquals.value
      }
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
      const descriptor = condition.notEquals
      if (
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, 'key')
      ) {
        return state[descriptor.key] !== descriptor.value
      }
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'ecosystemSelected')) {
      return (
        Array.isArray(state.ecosystems) &&
        state.ecosystems.indexOf(condition.ecosystemSelected) !== -1
      )
    }
    if (Array.isArray(condition.anyEcosystemSelected)) {
      return condition.anyEcosystemSelected.some(function (item) {
        return (
          Array.isArray(state.ecosystems) &&
          state.ecosystems.indexOf(item) !== -1
        )
      })
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'not')) {
      return !matchesCondition(condition.not)
    }
    if (Array.isArray(condition.all)) {
      return condition.all.every(matchesCondition)
    }
    if (Array.isArray(condition.any)) {
      return condition.any.some(matchesCondition)
    }
    return true
  }

  function visible (field) {
    return matchesCondition(field.showIf)
  }

  function buildCommand (inputState, options) {
    options = options || {}
    const platform = options.platform || detectPlatform()
    const s = normalizeState(inputState)
    const parts = [UI_MANIFEST.commandPrefix]

    // Only include --path when a non-empty directory is entered
    if (!s.globalOnly && s.path) {
      pushFlag(parts, '--path', s.path, platform)
    }
    if (s.globalOnly) parts.push('--global-only')
    if (s.ecosystems.length > 0 && !(s.ecosystems.length === 1 && s.ecosystems[0] === 'npm')) {
      parts.push('--ecosystems')
      if (s.ecosystems.length === SUPPORTED_ECOSYSTEMS.length) {
        parts.push('scan-all')
      } else {
        parts.push(shellQuote(s.ecosystems.join(','), platform))
      }
    }
    pushFlag(parts, '--library', s.library, platform)
    if (s.graphResolution) parts.push('--graph-resolution')
    if (
      s.gradleTask &&
      s.graphResolution &&
      s.ecosystems.indexOf('gradle') !== -1
    ) {
      pushFlag(parts, '--gradle-task', s.gradleTask, platform)
    }
    if (s.dependencyCheckMode) {
      parts.push('--dependency-check-mode')
    } else if (s.nvdMode === 'off') {
      parts.push('--no-nvd')
    } else if (s.nvdMode === 'on') {
      parts.push('--nvd-mode')
      parts.push('on')
    }
    if (
      s.nvdMode !== 'off' &&
      s.nvdApiKey &&
      s.ecosystems.some(function (item) {
        return item === 'maven' || item === 'gradle'
      })
    ) {
      pushFlag(parts, '--nvd-api-key', s.nvdApiKey, platform)
    }
    if (s.severity && s.severity !== 'low') {
      pushFlag(parts, '--severity', s.severity, platform)
    }
    if (s.json) parts.push('--json')
    if (s.banner && s.banner !== 'on') {
      parts.push('--banner')
      parts.push(shellQuote(s.banner, platform))
    }
    if (s.noCache) parts.push('--no-cache')
    if (s.fix) parts.push('--fix')
    pushFlag(parts, '--export-txt', s.exportTxt, platform)
    pushFlag(parts, '--export-html', s.exportHtml, platform)
    pushFlag(parts, '--export-sarif', s.exportSarif, platform)
    pushFlag(parts, '--export-json', s.exportJson, platform)
    pushFlag(parts, '--export-csv', s.exportCsv, platform)
    pushFlag(parts, '--baseline', s.baseline, platform)
    pushFlag(parts, '--write-baseline', s.writeBaseline, platform)
    if (s.strictBaseline) parts.push('--strict-baseline')
    if (s.failOnSeverity) {
      pushFlag(parts, '--fail-on-severity', s.failOnSeverity, platform)
    }
    if (s.maxCritical != null) {
      pushFlag(parts, '--max-critical', s.maxCritical, platform)
    }
    if (s.maxHigh != null) pushFlag(parts, '--max-high', s.maxHigh, platform)
    pushFlag(parts, '--why', s.why, platform)
    if (s.benchmark) parts.push('--benchmark')
    if (s.watch) {
      parts.push('--watch')
      if (
        s.notifyOnSeverity &&
        s.notifyOnSeverity !== DEFAULT_NOTIFY_SEVERITY
      ) {
        pushFlag(parts, '--notify-on-severity', s.notifyOnSeverity, platform)
      }
      if (s.stateFile && s.stateFile !== DEFAULT_WATCH_STATE_FILE) {
        pushFlag(parts, '--state-file', s.stateFile, platform)
      }
      if (s.alertsFile && s.alertsFile !== DEFAULT_ALERTS_FILE) {
        pushFlag(parts, '--alerts-file', s.alertsFile, platform)
      }
      if (s.alertsMd) {
        pushFlag(parts, '--alerts-md', s.alertsMd, platform)
      }
      if (s.reconcileInterval !== DEFAULT_RECONCILE_INTERVAL_SEC) {
        pushFlag(parts, '--reconcile-interval', s.reconcileInterval, platform)
      }
      if (s.watchDebounceMs !== DEFAULT_WATCH_DEBOUNCE_MS) {
        pushFlag(parts, '--watch-debounce-ms', s.watchDebounceMs, platform)
      }
    }
    if (s.global) parts.push('--global')
    if (s.allDrives) parts.push('--all-drives')
    if (s.verbose) parts.push('--verbose')

    return parts.join(' ')
  }

  function validateState (inputState) {
    const s = normalizeState(inputState)
    const errors = []

    if (s.ecosystems.length === 0) {
      errors.push('Select at least one ecosystem.')
    }
    for (let i = 0; i < s.ecosystems.length; i++) {
      if (SUPPORTED_ECOSYSTEMS.indexOf(s.ecosystems[i]) === -1) {
        errors.push('Unsupported ecosystem: ' + s.ecosystems[i])
      }
    }
    if (['low', 'moderate', 'high', 'critical'].indexOf(s.severity) === -1) {
      errors.push('Invalid severity.')
    }
    if (['auto', 'on', 'off'].indexOf(s.nvdMode) === -1) {
      errors.push('Invalid NVD mode.')
    }
    if (['on', 'off'].indexOf(s.banner) === -1) {
      errors.push('Invalid banner mode.')
    }

    if (s.library) {
      const raw = String(s.library).trim()
      const idx = raw.indexOf(':')
      if (idx <= 0 || idx === raw.length - 1) {
        errors.push('Invalid library format. Use <ecosystem>:<name>.')
      } else {
        const eco = raw.slice(0, idx).trim().toLowerCase()
        if (SUPPORTED_ECOSYSTEMS.indexOf(eco) === -1) {
          errors.push('Unsupported ecosystem in library: ' + eco)
        }
      }
    }
    const intChecks = [
      ['maxCritical', s.maxCritical],
      ['maxHigh', s.maxHigh],
      ['reconcileInterval', s.reconcileInterval],
      ['watchDebounceMs', s.watchDebounceMs]
    ]
    for (let j = 0; j < intChecks.length; j++) {
      const key = intChecks[j][0]
      const val = intChecks[j][1]
      if (val != null && (!Number.isInteger(val) || val < 0)) {
        errors.push(key + ' must be a non-negative integer.')
      }
    }
    return { state: s, errors }
  }

  // ── UI logic ──────────────────────────────────────────────────────────────

  function setStatus (message, kind) {
    statusEl.textContent = message
    commandEl.classList.remove('ok', 'warn')
    if (kind) commandEl.classList.add(kind)
  }

  function applyInputValue (field, input) {
    if (field.type === 'boolean') {
      state[field.key] = Boolean(input.checked)
      return
    }
    if (field.type === 'multiselect') {
      state[field.key] = Array.from(input.selectedOptions).map(
        function (option) {
          return option.value
        }
      )
      return
    }
    if (field.type === 'number') {
      state[field.key] = input.value === '' ? '' : Number(input.value)
      return
    }
    state[field.key] = input.value
  }

  function applyStateToInput (field, input) {
    const value = state[field.key]
    if (field.type === 'boolean') {
      input.checked = Boolean(value)
      return
    }
    if (field.type === 'multiselect') {
      const selected = new Set(Array.isArray(value) ? value : [])
      for (let i = 0; i < input.options.length; i++) {
        input.options[i].selected = selected.has(input.options[i].value)
      }
      return
    }
    input.value = value == null ? '' : String(value)
  }

  function createFieldNode (field) {
    const wrapper = document.createElement('div')
    wrapper.className = 'field'
    wrapper.dataset.key = field.key
    const inputId = 'field-' + field.key
    let input

    if (field.type === 'boolean') {
      wrapper.classList.add('boolean-row')
      input = document.createElement('input')
      input.type = 'checkbox'
      input.id = inputId
      input.dataset.key = field.key
      wrapper.appendChild(input)

      const label = document.createElement('label')
      label.className = 'field-title'
      label.htmlFor = inputId
      label.textContent = field.label
      wrapper.appendChild(label)
    } else {
      const label = document.createElement('label')
      label.className = 'field-title'
      label.htmlFor = inputId
      label.textContent = field.label
      wrapper.appendChild(label)

      if (field.type === 'select') {
        input = document.createElement('select')
      } else if (field.type === 'multiselect') {
        input = document.createElement('select')
        input.multiple = true
      } else {
        input = document.createElement('input')
        input.type = field.type === 'number' ? 'number' : 'text'
        if (field.placeholder) input.placeholder = field.placeholder
      }

      if (field.type === 'select' || field.type === 'multiselect') {
        const options = field.options || []
        for (let i = 0; i < options.length; i++) {
          const opt = document.createElement('option')
          opt.value = options[i].value
          opt.textContent = options[i].label
          input.appendChild(opt)
        }
      }

      input.id = inputId
      input.dataset.key = field.key
      wrapper.appendChild(input)
    }

    if (field.help) {
      const help = document.createElement('small')
      help.className = 'field-help'
      help.textContent = field.help
      wrapper.appendChild(help)
    }

    const onInput = function () {
      applyInputValue(field, input)
      scheduleRefresh()
    }
    input.addEventListener('input', onInput)
    input.addEventListener('change', onInput)

    applyStateToInput(field, input)
    return { wrapper, input, field }
  }

  function seedState (initialState) {
    const keys = Object.keys(initialState || {})
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      const v = initialState[k]
      state[k] = Array.isArray(v) ? v.slice() : v
    }
  }

  function render () {
    if (!manifest) return
    app.innerHTML = ''
    fieldRegistry.clear()

    const sections = manifest.sections
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const card = document.createElement('section')
      card.className = 'card'

      const title = document.createElement('h2')
      title.textContent = section.label
      card.appendChild(title)

      const description = document.createElement('p')
      description.textContent = section.description
      card.appendChild(description)

      const fields = section.fields
      for (let j = 0; j < fields.length; j++) {
        const node = createFieldNode(fields[j])
        fieldRegistry.set(fields[j].key, node)
        card.appendChild(node.wrapper)
      }

      app.appendChild(card)
    }

    updateFieldVisibility()
  }

  function updateFieldVisibility () {
    if (!manifest) return
    const sections = manifest.sections
    for (let i = 0; i < sections.length; i++) {
      const fields = sections[i].fields
      for (let j = 0; j < fields.length; j++) {
        const node = fieldRegistry.get(fields[j].key)
        if (!node) continue
        node.wrapper.hidden = !visible(fields[j])
      }
    }
  }

  function updateCommand () {
    const result = validateState(state)
    if (result.errors.length > 0) {
      setStatus(result.errors.join(' '), 'warn')
      commandEl.textContent = ''
      return
    }
    commandEl.textContent = buildCommand(result.state)
    setStatus('Command ready.', 'ok')
  }

  function scheduleRefresh () {
    updateFieldVisibility()
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(updateCommand, 75)
  }

  copyBtn.addEventListener('click', function () {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(commandEl.textContent || '').then(
          function () {
            setStatus('Command copied to clipboard.', 'ok')
          },
          function (err) {
            setStatus(
              'Copy failed: ' + (err && err.message ? err.message : err),
              'warn'
            )
          }
        )
      } else {
        setStatus('Clipboard not available in this browser.', 'warn')
      }
    } catch (e) {
      setStatus('Copy failed: ' + (e && e.message ? e.message : e), 'warn')
    }
  })

  // ── bootstrap ─────────────────────────────────────────────────────────────
  manifest = UI_MANIFEST
  seedState({
    ecosystems: ['npm'],
    severity: 'low',
    nvdMode: 'auto',
    banner: 'on',
    path: ''
  })
  render()
  commandEl.textContent = buildCommand(state)
  setStatus('Ready.', 'ok')
})()
