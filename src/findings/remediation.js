'use strict'

const path = require('path')

/**
 * Generates a human-readable remediation hint based on ecosystem and dependency context.
 */
function generateRemediationHint ({
  ecosystem,
  packageName,
  fixedVersion,
  foundIn
}) {
  const eco = String(ecosystem || '').toLowerCase()

  if (!foundIn || foundIn.length === 0) {
    return fixedVersion
      ? `Upgrade to version ${fixedVersion}`
      : 'No known fixed version available.'
  }

  let isGlobal = false
  let isTransitive = false
  let isDirect = false

  const parents = new Set()
  const manifests = new Set()

  for (const entry of foundIn) {
    if (entry.dependency_type === 'global') isGlobal = true
    else if (entry.dependency_type === 'transitive') {
      isTransitive = true
      if (entry.parent && entry.parent.name) parents.add(entry.parent.name)
    } else if (entry.dependency_type === 'direct') {
      isDirect = true
    }

    if (entry.manifest_path) manifests.add(path.basename(entry.manifest_path))
  }

  if (isGlobal) {
    return fixedVersion
      ? `Run the global update command for '${packageName}@${fixedVersion}'`
      : `Uninstall global package '${packageName}' or wait for a patch.`
  }

  const manifestList = Array.from(manifests)
  const scopeStr =
    manifestList.length > 0 ? ` (in ${manifestList.join(', ')})` : ''

  if (eco === 'python' && manifestList.includes('installed-environment')) {
    return fixedVersion
      ? `Upgrade ${packageName} to version ${fixedVersion} in the active Python environment, then refresh the lockfile if this project uses one.`
      : 'Manual review required in the active Python environment.'
  }

  const DIRECT_HINTS = {
    npm: (pkg, ver) => `Upgrade ${pkg} to version ${ver} in package.json.`,
    maven: (pkg, ver) => `Update ${pkg} to version ${ver} in pom.xml.`,
    gradle: (pkg, ver) =>
      `Update ${pkg} to version ${ver} in build.gradle/build.gradle.kts or your Gradle version catalog/lockfile.`,
    nuget: (pkg, ver) => `Update ${pkg} to version ${ver} in project manifest.`,
    ruby: (pkg, ver) =>
      `Run 'bundle update ${pkg}' to update to version ${ver}.`,
    rust: (pkg, ver) =>
      `Run 'cargo update -p ${pkg}' to update to version ${ver}.`,
    php: (pkg, ver) =>
      `Run 'composer update ${pkg}' to update to version ${ver}.`
  }

  if (isDirect) {
    const template = DIRECT_HINTS[eco]
    if (template) {
      return fixedVersion
        ? template(packageName, fixedVersion)
        : `Review ${packageName} usage${scopeStr}.`
    }
    return fixedVersion
      ? `Update ${packageName} to version ${fixedVersion}${scopeStr}.`
      : `Review ${packageName} usage${scopeStr}.`
  }

  if (isTransitive) {
    const parentList = Array.from(parents)
    const parentStr =
      parentList.length > 0 ? ` via **${parentList.join(', ')}**` : ''
    const fixPart = fixedVersion
      ? ` A fix is available in version ${fixedVersion}.`
      : ' No known fix available yet.'

    if (eco === 'npm') {
      return `Transitive dependency${parentStr}. Update the parent package(s) or use 'npm audit fix'.${fixPart}`
    }
    return `Transitive dependency${parentStr}${scopeStr}. Update the parent package(s).${fixPart}`
  }

  return fixedVersion
    ? `Upgrade to version ${fixedVersion}${scopeStr}.`
    : `Manual review required${scopeStr}.`
}

module.exports = {
  generateRemediationHint
}
