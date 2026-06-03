'use strict'

const os = require('os')
const path = require('path')
const fsp = require('fs/promises')
const { PLATFORM, ROOT_KINDS } = require('../config/constants')
const { dedupePaths } = require('../shared/path-utils')

async function pathExists (p) {
  try {
    await fsp.access(p)
    return true
  } catch (_) {
    return false
  }
}

function isBroadRoot (rootPath) {
  const normalized = path.resolve(rootPath)
  const home = os.homedir()
  if (normalized === home) return true
  if (PLATFORM === 'win32') {
    return /^[A-Z]:\\?$/.test(normalized)
  }
  return normalized === '/'
}

function classifyRoot (rootPath, profile) {
  const normalized = path.resolve(rootPath)
  const home = os.homedir()

  if (normalized.includes('node_modules')) {
    return ROOT_KINDS.globalPackage
  }
  if (normalized.includes('.vscode') && normalized.includes('extensions')) {
    return ROOT_KINDS.editorExtension
  }
  if (normalized.includes('.config') && normalized.includes('mcp')) {
    return ROOT_KINDS.mcpConfig
  }
  if (PLATFORM === 'win32' && /^[A-Z]:\\?$/.test(normalized)) {
    return profile === 'deep' ? ROOT_KINDS.deepHome : ROOT_KINDS.unknown
  }
  if (normalized === '/') {
    return profile === 'deep' ? ROOT_KINDS.deepHome : ROOT_KINDS.unknown
  }
  if (normalized === home) {
    return ROOT_KINDS.userPackage
  }
  if (normalized.startsWith(home)) {
    return ROOT_KINDS.project
  }
  return ROOT_KINDS.unknown
}

function formatRootEntry (rootEntry) {
  return `${rootEntry.kind}\t${rootEntry.path}`
}

async function filterExistingRoots (rootEntries) {
  const filtered = []
  for (const entry of rootEntries) {
    if (await pathExists(entry.path)) {
      filtered.push(entry)
    }
  }
  return filtered
}

function baselineCandidateRoots (home) {
  const candidates = []

  if (PLATFORM === 'win32') {
    candidates.push({ path: path.join(home, 'AppData', 'Roaming', 'npm'), kind: ROOT_KINDS.globalPackage })
    candidates.push({ path: path.join(home, '.vscode', 'extensions'), kind: ROOT_KINDS.editorExtension })
  } else {
    candidates.push({ path: '/usr/local/lib/node_modules', kind: ROOT_KINDS.globalPackage })
    candidates.push({ path: path.join(home, '.vscode', 'extensions'), kind: ROOT_KINDS.editorExtension })
  }

  return candidates
}

function projectCandidateRoots (home) {
  const candidates = []

  const projectDirs = ['projects', 'repos', 'code', 'src', 'dev', 'workspace', 'work']
  for (const dir of projectDirs) {
    candidates.push({ path: path.join(home, dir), kind: ROOT_KINDS.project })
  }

  if (PLATFORM === 'win32') {
    candidates.push({ path: path.join(home, 'Documents'), kind: ROOT_KINDS.project })
    candidates.push({ path: path.join(home, 'Desktop'), kind: ROOT_KINDS.project })
    candidates.push({ path: path.join(home, '.vscode', 'extensions'), kind: ROOT_KINDS.editorExtension })
  } else {
    candidates.push({ path: path.join(home, '.vscode', 'extensions'), kind: ROOT_KINDS.editorExtension })
  }

  return candidates
}

function systemCandidateRoots () {
  const candidates = []

  if (PLATFORM === 'win32') {
    for (let i = 67; i <= 90; i += 1) {
      const drive = `${String.fromCharCode(i)}:\\`
      candidates.push({ path: drive, kind: ROOT_KINDS.deepHome })
    }
  } else {
    candidates.push({ path: '/', kind: ROOT_KINDS.deepHome })
    candidates.push({ path: '/usr/local', kind: ROOT_KINDS.globalPackage })
    candidates.push({ path: '/opt', kind: ROOT_KINDS.deepHome })
  }

  return candidates
}

async function resolveProfileRoots (options, state) {
  const home = os.homedir()
  const notes = []
  let rootEntries = []

  if (options.roots && options.roots.length > 0) {
    for (const root of options.roots) {
      const resolved = path.resolve(root)
      if ((options.profile === 'baseline' || options.profile === 'project') && isBroadRoot(resolved)) {
        throw new Error(`Broad root "${root}" is not allowed for profile "${options.profile}". Use a more specific path.`)
      }
      rootEntries.push({
        path: resolved,
        kind: classifyRoot(root, options.profile)
      })
    }
    notes.push(`Using ${rootEntries.length} explicit root(s)`)
  } else {
    switch (options.profile) {
      case 'baseline':
        rootEntries = baselineCandidateRoots(home)
        notes.push('Baseline profile: curated allowlist of common package locations')
        break
      case 'project':
        rootEntries = projectCandidateRoots(home)
        notes.push('Project profile: common project directories and editor extensions')
        break
      case 'deep':
        throw new Error('Deep profile requires at least one explicit --root. Pass --root /path/to/scan.')
      default:
        rootEntries = baselineCandidateRoots(home)
        notes.push(`Unknown profile "${options.profile}", falling back to baseline`)
    }
  }

  if (options.allUsers) {
    if (PLATFORM === 'win32') {
      const publicDir = process.env.PUBLIC || 'C:\\Users\\Public'
      rootEntries.push({ path: publicDir, kind: ROOT_KINDS.userPackage })
    } else {
      let userDirs
      try {
        userDirs = await fsp.readdir('/home', { withFileTypes: true })
      } catch (_) {
        userDirs = []
      }
      for (const entry of userDirs) {
        if (entry.isDirectory()) {
          rootEntries.push({ path: path.join('/home', entry.name), kind: ROOT_KINDS.userPackage })
        }
      }
    }
    notes.push('Including all-user directories')
  }

  rootEntries = await filterExistingRoots(rootEntries)

  const roots = dedupePaths(rootEntries.map((e) => e.path))
  const globalRoot = rootEntries.find((e) => e.kind === ROOT_KINDS.globalPackage)

  return {
    roots,
    rootEntries,
    globalRoot: globalRoot ? globalRoot.path : null,
    notes
  }
}

async function resolveLegacyRoots (options, state, helpers = {}) {
  const { getGlobalNpmRoot } = helpers
  const roots = []
  const rootEntries = []
  let globalRoot = null

  if (getGlobalNpmRoot) {
    globalRoot = await getGlobalNpmRoot()
    if (!globalRoot && state) state.globalRootUnavailable = true
  }

  if (options.globalOnly) {
    if (globalRoot) {
      roots.push(globalRoot)
      rootEntries.push({ path: globalRoot, kind: ROOT_KINDS.globalPackage })
    }
    return { roots: dedupePaths(roots), rootEntries, globalRoot, notes: [] }
  }

  if (options.pathExplicit) {
    roots.push(options.path)
    rootEntries.push({ path: options.path, kind: classifyRoot(options.path, 'legacy') })
  } else if (PLATFORM === 'win32') {
    const discovered = []
    try {
      const ps = require('../shared/command')
      const result = await ps.runCommand('powershell.exe', [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_LogicalDisk | Select-Object -ExpandProperty DeviceID'
      ])
      if (result.ok && result.stdout) {
        const lines = result.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
        for (const line of lines) {
          const root = line.endsWith('\\') ? line : `${line}\\`
          discovered.push(root)
        }
      }
    } catch (_) {}

    if (discovered.length === 0) {
      discovered.push('C:\\')
    }
    for (const d of discovered) {
      roots.push(d)
      rootEntries.push({ path: d, kind: ROOT_KINDS.deepHome })
    }
  } else {
    roots.push(os.homedir())
    rootEntries.push({ path: os.homedir(), kind: ROOT_KINDS.userPackage })
    if (options.global || options.allDrives) {
      roots.push('/')
      rootEntries.push({ path: '/', kind: ROOT_KINDS.deepHome })
    }
  }

  if (globalRoot) {
    roots.push(globalRoot)
    rootEntries.push({ path: globalRoot, kind: ROOT_KINDS.globalPackage })
  }

  return { roots: dedupePaths(roots), rootEntries, globalRoot, notes: [] }
}

module.exports = {
  resolveProfileRoots,
  resolveLegacyRoots,
  classifyRoot,
  isBroadRoot,
  baselineCandidateRoots,
  projectCandidateRoots,
  systemCandidateRoots,
  filterExistingRoots,
  formatRootEntry
}
