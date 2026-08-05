'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getLastScanTime (dataDir) {
  const stampFile = path.join(dataDir, '.last-scan-ts')
  try {
    const ts = fs.readFileSync(stampFile, 'utf8').trim()
    const parsed = parseInt(ts, 10)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

function setLastScanTime (dataDir) {
  const stampFile = path.join(dataDir, '.last-scan-ts')
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(stampFile, String(Date.now()), 'utf8')
  } catch {
    // best-effort — do not crash
  }
}

function main () {
  const dataDir = process.env.CLAUDE_PLUGIN_DATA || ''
  if (!dataDir) process.exit(0)

  const now = Date.now()
  const lastScan = getLastScanTime(dataDir)
  if (now - lastScan < SCAN_INTERVAL_MS) process.exit(0)

  try {
    const out = execFileSync('npx', [
      '-y', 'github:boredom1234/eco-guardian',
      '--ecosystems', 'scan-all',
      '--json',
      '--banner', 'off',
      '--no-cache'
    ], { timeout: 90000, encoding: 'utf8', windowsHide: true })

    setLastScanTime(dataDir)

    const result = JSON.parse(out)
    const findings = result.findings || result
    if (!Array.isArray(findings) || findings.length === 0) process.exit(0)

    const summary = findings.slice(0, 10).map((f) =>
      `- ${f.severity || 'unknown'}: ${f.package}@${f.version} (${f.ecosystem}) — ${f.id || 'no advisory'}`
    ).join('\n')

    const output = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `## Daily Vulnerability Scan Results\n\nFound ${findings.length} finding(s):\n${summary}${findings.length > 10 ? '\n...and ' + (findings.length - 10) + ' more' : ''}`
      }
    }
    process.stdout.write(JSON.stringify(output))
  } catch {
    // eco-guardian unavailable or timeout — fail open
  }

  process.exit(0)
}

main()
