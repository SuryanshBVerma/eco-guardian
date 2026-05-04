'use strict'

const fsp = require('fs/promises')
const path = require('path')

async function writeJsonReport (findings, options) {
  if (!options.exportJson) return null
  const outFile = path.resolve(process.cwd(), options.exportJson)
  await fsp.writeFile(
    outFile,
    `${JSON.stringify(findings, null, 2)}\n`,
    'utf8'
  )
  return outFile
}

module.exports = {
  writeJsonReport
}
