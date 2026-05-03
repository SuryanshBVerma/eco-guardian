'use strict'

const fsp = require('fs/promises')
const path = require('path')
const { VERSION } = require('../config/constants')
const { getFindingConfidence } = require('./common')
const { resolveSarifLocation } = require('./location')

async function writeSarifReport (
  findings,
  packageCount,
  options,
  resolutionSummary,
  suppressedCount,
  policy = null,
  queryDiagnostics = null
) {
  if (!options.exportSarif) return null
  const outFile = path.resolve(process.cwd(), options.exportSarif)

  const rulesMap = new Map()
  for (const finding of findings) {
    if (!rulesMap.has(finding.advisory_id)) {
      rulesMap.set(finding.advisory_id, {
        id: finding.advisory_id,
        shortDescription: { text: finding.title || finding.advisory_id },
        fullDescription: { text: finding.title || finding.advisory_id },
        helpUri:
          (finding.references && finding.references[0]) ||
          `https://osv.dev/vulnerability/${finding.advisory_id}`,
        properties: {
          severity: finding.severity,
          cvss: finding.cvss,
          cve: finding.cve
        }
      })
    }
  }

  const results = await Promise.all(
    (findings || []).map(async (f) => {
      const locations = await Promise.all(
        (f.found_in || []).map(async (loc) => {
          const uri = loc.manifest_path || loc.project || 'unknown'
          const region = await resolveSarifLocation(loc, f)
          return {
            physicalLocation: {
              artifactLocation: { uri, uriBaseId: 'PROJECTROOT' },
              region
            }
          }
        })
      )

      return {
        ruleId: f.advisory_id,
        message: {
          text: `Vulnerability in ${f.package}@${f.version}. ${f.remediation_hint || 'Manual review required.'}`
        },
        level:
          f.severity === 'critical' || f.severity === 'high'
            ? 'error'
            : 'warning',
        locations,
        properties: {
          ecosystem: f.ecosystem,
          package: f.package,
          version: f.version,
          fixed_version: f.fixed_version,
          source: f.source || 'osv',
          match_confidence: getFindingConfidence(f),
          resolution_mode: f.resolution_mode || 'inventory'
        }
      }
    })
  )

  const sarif = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'eco-guardian',
            version: VERSION,
            rules: Array.from(rulesMap.values())
          }
        },
        originalUriBaseIds: {
          PROJECTROOT: {
            uri: `file:///${path.resolve(options.path).replace(/\\/g, '/')}/`
          }
        },
        results,
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              packageCount,
              suppressedCount,
              resolutionSummary,
              policy,
              queryDiagnostics
            }
          }
        ]
      }
    ]
  }

  await fsp.writeFile(outFile, JSON.stringify(sarif, null, 2), 'utf8')
  return outFile
}

module.exports = {
  writeSarifReport
}
