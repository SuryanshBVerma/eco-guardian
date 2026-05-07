'use strict'

const { UI_MANIFEST } = require('./manifest')
const {
  DEFAULT_ALERTS_FILE,
  DEFAULT_NOTIFY_SEVERITY,
  DEFAULT_RECONCILE_INTERVAL_SEC,
  DEFAULT_WATCH_DEBOUNCE_MS,
  DEFAULT_WATCH_STATE_FILE,
  SUPPORTED_ECOSYSTEMS
} = require('../config/constants')

function shellQuote (value, platform = process.platform) {
  const text = String(value == null ? '' : value)
  if (text === '') return "''"
  if (platform === 'win32') {
    return `'${text.replace(/'/g, "''")}'`
  }
  return `'${text.replace(/'/g, "'\\''")}'`
}

function normalizeEcosystems (value) {
  if (Array.isArray(value)) {
    const list = value
      .map((item) => String(item).toLowerCase())
      .filter(Boolean)
    if (list.length === 1 && list[0] === 'scan-all') {
      return SUPPORTED_ECOSYSTEMS.slice()
    }
    return list
  }
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (list.length === 1 && list[0] === 'scan-all') {
      return SUPPORTED_ECOSYSTEMS.slice()
    }
    return list
  }
  return ['npm']
}

function normalizeState (input = {}) {
  const state = { ...input }
  state.path = state.path == null ? '' : String(state.path)
  state.globalOnly = Boolean(state.globalOnly)
  state.ecosystems = normalizeEcosystems(state.ecosystems)
  state.graphResolution = Boolean(state.graphResolution)
  state.gradleTask = state.gradleTask == null ? null : String(state.gradleTask)
  state.dependencyCheckMode = Boolean(state.dependencyCheckMode)
  state.nvdMode = String(state.nvdMode || 'auto').toLowerCase()
  state.nvdApiKey = state.nvdApiKey == null ? null : String(state.nvdApiKey)
  state.severity = String(state.severity || 'low').toLowerCase()
  state.json = Boolean(state.json)
  state.banner = String(state.banner || 'on').toLowerCase()
  state.noCache = Boolean(state.noCache)
  state.fix = Boolean(state.fix)
  state.exportTxt = state.exportTxt == null ? null : String(state.exportTxt)
  state.exportHtml = state.exportHtml == null ? null : String(state.exportHtml)
  state.exportSarif =
    state.exportSarif == null ? null : String(state.exportSarif)
  state.exportJson = state.exportJson == null ? null : String(state.exportJson)
  state.exportCsv = state.exportCsv == null ? null : String(state.exportCsv)
  state.baseline = state.baseline == null ? null : String(state.baseline)
  state.writeBaseline =
    state.writeBaseline == null ? null : String(state.writeBaseline)
  state.strictBaseline = Boolean(state.strictBaseline)
  state.failOnSeverity =
    state.failOnSeverity == null
      ? null
      : String(state.failOnSeverity).toLowerCase()
  state.maxCritical =
    state.maxCritical == null || state.maxCritical === ''
      ? null
      : Number(state.maxCritical)
  state.maxHigh =
    state.maxHigh == null || state.maxHigh === ''
      ? null
      : Number(state.maxHigh)
  state.why = state.why == null ? null : String(state.why)
  state.benchmark = Boolean(state.benchmark)
  state.watch = Boolean(state.watch)
  state.notifyOnSeverity = String(
    state.notifyOnSeverity || DEFAULT_NOTIFY_SEVERITY
  ).toLowerCase()
  state.stateFile = state.stateFile == null ? null : String(state.stateFile)
  state.alertsFile =
    state.alertsFile == null ? DEFAULT_ALERTS_FILE : String(state.alertsFile)
  state.alertsMd = state.alertsMd == null ? null : String(state.alertsMd)
  state.reconcileInterval =
    state.reconcileInterval == null || state.reconcileInterval === ''
      ? DEFAULT_RECONCILE_INTERVAL_SEC
      : Number(state.reconcileInterval)
  state.watchDebounceMs =
    state.watchDebounceMs == null || state.watchDebounceMs === ''
      ? DEFAULT_WATCH_DEBOUNCE_MS
      : Number(state.watchDebounceMs)
  state.global = Boolean(state.global)
  state.allDrives = Boolean(state.allDrives)
  state.verbose = Boolean(state.verbose)
  return state
}

function matchesCondition (condition, state) {
  if (!condition) return true
  if (Array.isArray(condition)) {
    return condition.every((item) => matchesCondition(item, state))
  }
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
    if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'key')) {
      return state[descriptor.key] !== descriptor.value
    }
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'ecosystemSelected')) {
    return state.ecosystems.includes(condition.ecosystemSelected)
  }
  if (Array.isArray(condition.anyEcosystemSelected)) {
    return condition.anyEcosystemSelected.some((item) =>
      state.ecosystems.includes(item)
    )
  }
  if (Object.prototype.hasOwnProperty.call(condition, 'not')) {
    return !matchesCondition(condition.not, state)
  }
  if (Array.isArray(condition.all)) {
    return condition.all.every((item) => matchesCondition(item, state))
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((item) => matchesCondition(item, state))
  }
  return true
}

function isVisible (field, state) {
  return matchesCondition(field.showIf, state)
}

function getVisibleFields (state, manifest = UI_MANIFEST) {
  const normalized = normalizeState(state)
  return manifest.sections.flatMap((section) =>
    section.fields.filter((field) => isVisible(field, normalized))
  )
}

function pushFlag (parts, flag, value, platform = process.platform) {
  if (value == null || value === '') return
  parts.push(flag)
  if (value !== true) {
    parts.push(shellQuote(value, platform))
  }
}

function buildCommand (inputState = {}, options = {}) {
  const platform = options.platform || process.platform
  const state = normalizeState(inputState)
  const parts = [UI_MANIFEST.commandPrefix]

  if (!state.globalOnly && state.path) {
    pushFlag(parts, '--path', state.path, platform)
  }
  if (state.globalOnly) parts.push('--global-only')
  if (
    state.ecosystems.length > 0 &&
    !(state.ecosystems.length === 1 && state.ecosystems[0] === 'npm')
  ) {
    parts.push('--ecosystems')
    if (state.ecosystems.length === SUPPORTED_ECOSYSTEMS.length) {
      parts.push('scan-all')
    } else {
      parts.push(shellQuote(state.ecosystems.join(','), platform))
    }
  }
  if (state.graphResolution) parts.push('--graph-resolution')
  if (
    state.gradleTask &&
    state.graphResolution &&
    state.ecosystems.includes('gradle')
  ) {
    pushFlag(parts, '--gradle-task', state.gradleTask, platform)
  }
  if (state.dependencyCheckMode) {
    parts.push('--dependency-check-mode')
  } else if (state.nvdMode === 'off') {
    parts.push('--no-nvd')
  } else if (state.nvdMode === 'on') {
    parts.push('--nvd-mode')
    parts.push('on')
  }
  if (
    state.nvdMode !== 'off' &&
    state.nvdApiKey &&
    state.ecosystems.some((item) => item === 'maven' || item === 'gradle')
  ) {
    pushFlag(parts, '--nvd-api-key', state.nvdApiKey, platform)
  }
  if (state.severity && state.severity !== 'low') {
    pushFlag(parts, '--severity', state.severity, platform)
  }
  if (state.json) parts.push('--json')
  if (state.banner && state.banner !== 'on') {
    parts.push('--banner')
    parts.push(shellQuote(state.banner, platform))
  }
  if (state.noCache) parts.push('--no-cache')
  if (state.fix) parts.push('--fix')
  pushFlag(parts, '--export-txt', state.exportTxt, platform)
  pushFlag(parts, '--export-html', state.exportHtml, platform)
  pushFlag(parts, '--export-sarif', state.exportSarif, platform)
  pushFlag(parts, '--export-json', state.exportJson, platform)
  pushFlag(parts, '--export-csv', state.exportCsv, platform)
  pushFlag(parts, '--baseline', state.baseline, platform)
  pushFlag(parts, '--write-baseline', state.writeBaseline, platform)
  if (state.strictBaseline) parts.push('--strict-baseline')
  if (state.failOnSeverity) {
    pushFlag(parts, '--fail-on-severity', state.failOnSeverity, platform)
  }
  if (state.maxCritical != null) {
    pushFlag(parts, '--max-critical', state.maxCritical, platform)
  }
  if (state.maxHigh != null) {
    pushFlag(parts, '--max-high', state.maxHigh, platform)
  }
  pushFlag(parts, '--why', state.why, platform)
  if (state.benchmark) parts.push('--benchmark')
  if (state.watch) {
    parts.push('--watch')
    if (
      state.notifyOnSeverity &&
      state.notifyOnSeverity !== DEFAULT_NOTIFY_SEVERITY
    ) {
      pushFlag(parts, '--notify-on-severity', state.notifyOnSeverity, platform)
    }
    if (state.stateFile && state.stateFile !== DEFAULT_WATCH_STATE_FILE) {
      pushFlag(parts, '--state-file', state.stateFile, platform)
    }
    if (state.alertsFile && state.alertsFile !== DEFAULT_ALERTS_FILE) {
      pushFlag(parts, '--alerts-file', state.alertsFile, platform)
    }
    if (state.alertsMd) {
      pushFlag(parts, '--alerts-md', state.alertsMd, platform)
    }
    if (state.reconcileInterval !== DEFAULT_RECONCILE_INTERVAL_SEC) {
      pushFlag(
        parts,
        '--reconcile-interval',
        state.reconcileInterval,
        platform
      )
    }
    if (state.watchDebounceMs !== DEFAULT_WATCH_DEBOUNCE_MS) {
      pushFlag(parts, '--watch-debounce-ms', state.watchDebounceMs, platform)
    }
  }
  if (state.global) parts.push('--global')
  if (state.allDrives) parts.push('--all-drives')
  if (state.verbose) parts.push('--verbose')

  return parts.join(' ')
}

function validateState (inputState = {}) {
  const state = normalizeState(inputState)
  const errors = []

  if (state.ecosystems.length === 0) {
    errors.push('Select at least one ecosystem.')
  }
  for (const ecosystem of state.ecosystems) {
    if (!SUPPORTED_ECOSYSTEMS.includes(ecosystem)) {
      errors.push(`Unsupported ecosystem: ${ecosystem}`)
    }
  }
  if (!['low', 'moderate', 'high', 'critical'].includes(state.severity)) {
    errors.push('Invalid severity.')
  }
  if (!['auto', 'on', 'off'].includes(state.nvdMode)) {
    errors.push('Invalid NVD mode.')
  }
  if (!['on', 'off'].includes(state.banner)) {
    errors.push('Invalid banner mode.')
  }
  for (const [key, value] of [
    ['maxCritical', state.maxCritical],
    ['maxHigh', state.maxHigh],
    ['reconcileInterval', state.reconcileInterval],
    ['watchDebounceMs', state.watchDebounceMs]
  ]) {
    if (value != null && (!Number.isInteger(value) || value < 0)) {
      errors.push(`${key} must be a non-negative integer.`)
    }
  }
  return { state, errors }
}

module.exports = {
  UI_MANIFEST,
  buildCommand,
  getVisibleFields,
  normalizeState,
  shellQuote,
  validateState
}
