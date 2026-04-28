'use strict'

/**
 * Extracts vendor/product/version evidence from a Maven or Gradle package record.
 * Both ecosystems store name as "groupId:artifactId" (confirmed in scan/gradle.js and resolve/gradle.js).
 */
function buildJavaEvidence (pkg) {
  const name = String(pkg.name || '').replace(/\0/g, '')
  const parts = name.split(':')
  const groupId = parts[0] || null
  const artifactId = parts[1] || parts[0] || null
  const version = String(pkg.version || '').replace(/\0/g, '') || null
  return {
    ecosystem: pkg.ecosystem,
    packageName: name,
    version,
    groupId,
    artifactId,
    occurrences: pkg.occurrences || [],
    paths: pkg.paths || []
  }
}

module.exports = { buildJavaEvidence }
