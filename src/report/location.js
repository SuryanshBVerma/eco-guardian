'use strict'

const fsp = require('fs/promises')

const MAX_CACHE_SIZE = 200
const fileCache = new Map()

async function readLines (filePath) {
  if (!filePath) return null
  if (fileCache.has(filePath)) {
    const lines = fileCache.get(filePath)
    fileCache.delete(filePath)
    fileCache.set(filePath, lines)
    return lines
  }
  try {
    const content = await fsp.readFile(filePath, 'utf8')
    const lines = content.split(/\r?\n/)
    if (fileCache.size >= MAX_CACHE_SIZE) {
      const firstKey = fileCache.keys().next().value
      fileCache.delete(firstKey)
    }
    fileCache.set(filePath, lines)
    return lines
  } catch (_) {
    fileCache.set(filePath, null)
    return null
  }
}

function buildNeedles (finding) {
  const needles = []
  const name = String(finding && finding.package ? finding.package : '')
  const version = String(finding && finding.version ? finding.version : '')

  if (name) needles.push(name)
  if (name && version) {
    needles.push(`${name}@${version}`)
    needles.push(`${name}:${version}`)
  }

  return needles
}

function findLineNumber (lines, needles) {
  if (!Array.isArray(lines) || lines.length === 0) return null
  if (!Array.isArray(needles) || needles.length === 0) return null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const needle of needles) {
      if (needle && line.includes(needle)) return i + 1
    }
  }

  return null
}

async function resolveSarifLocation (location, finding) {
  if (location && Number.isInteger(location.line) && location.line > 0) {
    return { startLine: location.line }
  }

  const manifestPath = location && location.manifest_path
  const lines = await readLines(manifestPath)
  const lineNumber = findLineNumber(lines, buildNeedles(finding))
  if (lineNumber) return { startLine: lineNumber }
  return { startLine: 1 }
}

module.exports = {
  resolveSarifLocation,
  buildNeedles,
  findLineNumber,
  readLines
}
