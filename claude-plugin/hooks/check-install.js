'use strict'

const { execFileSync } = require('node:child_process')

// Fast regex gate — exit immediately for non-install commands.
const INSTALL_RE = /^(npm\s+(install|i|add)\s+(\S+)|pip\d?\s+install\s+(\S+)|cargo\s+(install|add)\s+(\S+)|gem\s+install\s+(\S+)|go\s+get\s+(\S+)|composer\s+require\s+(\S+))/i

const ECO_MAP = {
  npm: 'npm',
  pip: 'python',
  pip3: 'python',
  cargo: 'rust',
  gem: 'ruby',
  go: 'go',
  composer: 'php'
}

/**
 * Strip version constraints from a package name.
 * e.g. "lodash@4.17.21" → "lodash", "requests==2.28.0" → "requests"
 */
function stripVersion (raw) {
  return raw.replace(/[@:=<>~^].*$/, '').trim()
}

function main () {
  let input = ''
  process.stdin.on('data', (chunk) => { input += chunk })
  process.stdin.on('end', () => {
    let cmd
    try { cmd = JSON.parse(input).command } catch { process.exit(0) }
    if (!cmd) process.exit(0)

    const match = cmd.match(INSTALL_RE)
    if (!match) process.exit(0)

    // npm group: match[3], pip: match[4], cargo: match[6], gem: match[7], go: match[8], composer: match[9]
    const rawPkg = match[3] || match[4] || match[6] || match[7] || match[8] || match[9]
    const pkg = stripVersion(rawPkg)
    if (!pkg || pkg.startsWith('-')) process.exit(0)

    const tool = match[1].split(/\s+/)[0]
    const eco = ECO_MAP[tool] || 'npm'

    try {
      const out = execFileSync('npx', [
        '-y', 'github:boredom1234/eco-guardian',
        '--ecosystems', eco,
        '--json',
        '--banner', 'off',
        '--no-cache'
      ], { timeout: 15000, encoding: 'utf8', windowsHide: true })

      const result = JSON.parse(out)
      const findings = (result.findings || result).filter(
        (f) => f.package && f.package.toLowerCase() === pkg.toLowerCase()
      )
      if (findings.length > 0) {
        const sevs = findings.map((f) => f.severity || 'unknown')
        console.error(`eco-guardian: ${pkg} has ${findings.length} finding(s) [${sevs.join(', ')}]`)
      }
    } catch {
      // eco-guardian unavailable or timeout — fail open
    }

    process.exit(0)
  })
}

main()
