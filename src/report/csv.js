'use strict'

const fsp = require('fs/promises')
const path = require('path')
const { getFindingConfidence } = require('./common')

function csvCell (value) {
  const text = String(value == null ? '' : value)
  if (/[,"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

async function writeCsvReport (findings, options) {
  if (!options.exportCsv) return null
  const outFile = path.resolve(process.cwd(), options.exportCsv)
  const lines = [
    [
      'severity',
      'ecosystem',
      'package',
      'version',
      'advisory_id',
      'cve',
      'cvss',
      'fixed_version',
      'locations',
      'resolution_mode',
      'fix_command',
      'source',
      'confidence'
    ].join(',')
  ]

  for (const finding of findings || []) {
    lines.push(
      [
        csvCell(finding.severity),
        csvCell(finding.ecosystem),
        csvCell(finding.package),
        csvCell(finding.version),
        csvCell(finding.advisory_id),
        csvCell(finding.cve),
        csvCell(finding.cvss),
        csvCell(finding.fixed_version),
        csvCell((finding.found_in || []).length),
        csvCell(finding.resolution_mode),
        csvCell(finding.fix_command),
        csvCell(finding.source || 'osv'),
        csvCell(getFindingConfidence(finding))
      ].join(',')
    )
  }

  await fsp.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8')
  return outFile
}

module.exports = {
  writeCsvReport
}
