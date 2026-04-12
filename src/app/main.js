'use strict'

const { VERSION } = require('../config/constants')
const { parseArgs, printUsage } = require('../cli/args')
const { printBanner, log } = require('../cli/output')
const { runScan } = require('./run-scan')

function attachSignalHandlers (context) {
  const handler = (signal) => {
    context.interrupted = true
    process.stderr.write(
      `\n[WARN] Received ${signal}. Exiting gracefully with partial state.\n`
    )
    process.exit(2)
  }
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
}

async function main (argv = process.argv.slice(2)) {
  const state = { interrupted: false }
  attachSignalHandlers(state)

  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`[ERR] ${error.message}\n`)
    process.exitCode = 2
    return
  }

  if (options.help) {
    printUsage()
    process.exitCode = 0
    return
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`)
    process.exitCode = 0
    return
  }

  printBanner(options)

  try {
    const result = await runScan(options, state)
    process.exitCode = result.findings.length > 0 ? 1 : 0
  } catch (error) {
    log('error', error.message || String(error), options || { json: false })
    process.exitCode = 2
  }
}

module.exports = {
  main
}
