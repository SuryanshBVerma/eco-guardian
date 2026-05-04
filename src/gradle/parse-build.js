const path = require('path')

function containsVariable (str) {
  if (!str) return false
  return str.includes('${') || (str.includes('$') && /[a-zA-Z]/.test(str))
}

function lineNumberForIndex (content, index) {
  if (index <= 0) return 1
  return content.slice(0, index).split(/\r?\n/).length
}

/**
 * Enhanced regex-based parser for build.gradle and build.gradle.kts.
 * Extracts dependencies and their configurations.
 */
function parseGradleBuild (content, filePath) {
  const dependencies = []

  // 1. Match literal strings: implementation("org.slf4j:slf4j-api:1.7.25") or implementation '...'
  // Restrict [^'"] to not match newlines to avoid massive false positives
  const literalRegex = /\b([a-zA-Z]+)\s*\(?\s*(['"])([^'"\n\r]+)\2\s*\)?/g

  let match
  while ((match = literalRegex.exec(content)) !== null) {
    const config = match[1]
    const full = match[3]
    const line = lineNumberForIndex(content, match.index)

    // Ignore common non-dependency keywords to reduce noise
    const ignoredConfigs = [
      'archiveBaseName',
      'archiveVersion',
      'archiveClassifier',
      'mainClass',
      'group',
      'version',
      'name'
    ]
    if (ignoredConfigs.includes(config)) continue

    const parts = full.split(':')
    if (parts.length === 3) {
      const [g, a, v] = parts

      // Skip if contains interpolation variables we can't resolve yet
      if (containsVariable(g) || containsVariable(a) || containsVariable(v)) {
        continue
      }

      dependencies.push({
        group: g,
        name: a,
        version: v,
        configuration: config,
        type: 'direct',
        source: path.basename(filePath),
        line
      })
    }
  }

  // 2. Match map notation: implementation group: '...', name: '...', version: '...'
  // Supports optional parentheses
  const mapRegex =
    /\b([a-zA-Z]+)\s*\(?\s*group\s*[:=]\s*(['"])([^'"\n\r]+)\2\s*,\s*name\s*[:=]\s*(['"])([^'"\n\r]+)\4\s*,\s*version\s*[:=]\s*(['"])([^'"\n\r]+)\6\s*\)?/g

  while ((match = mapRegex.exec(content)) !== null) {
    const config = match[1]
    const g = match[3]
    const a = match[5]
    const v = match[7]
    const line = lineNumberForIndex(content, match.index)

    // Skip if contains interpolation variables we can't resolve yet
    if (containsVariable(g) || containsVariable(a) || containsVariable(v)) {
      continue
    }

    dependencies.push({
      group: g,
      name: a,
      version: v,
      configuration: config,
      type: 'direct',
      source: path.basename(filePath),
      line
    })
  }

  // 3. Match version catalog aliases: implementation(libs.slf4j.api) or implementation libs.xxx
  const aliasRegex =
    /(?:^|\s)([a-zA-Z]+)\s*\(?\s*libs\.([a-zA-Z0-9._-]+)\s*\)?/gm
  while ((match = aliasRegex.exec(content)) !== null) {
    const config = match[1]
    const alias = match[2]
    const line = lineNumberForIndex(content, match.index)
    dependencies.push({
      alias,
      configuration: config,
      type: 'direct',
      source: path.basename(filePath),
      line
    })
  }

  // 4. Match platforms: implementation platform('...')
  const platformRegex =
    /(?:^|\s)([a-zA-Z]+)\s+((?:enforced)?Platform)\s*\(?\s*(['"])([^'":\s]+):([^'":\s]+):([^'":\s]+)\3\s*\)?/gm
  while ((match = platformRegex.exec(content)) !== null) {
    const config = match[1]
    const platformType = match[2]
    const g = match[4]
    const a = match[5]
    const v = match[6]
    const line = lineNumberForIndex(content, match.index)
    dependencies.push({
      group: g,
      name: a,
      version: v,
      configuration: config,
      isPlatform: true,
      platformType, // platform or enforcedPlatform
      type: 'direct',
      source: path.basename(filePath),
      line
    })
  }

  return dependencies
}

module.exports = { parseGradleBuild }
