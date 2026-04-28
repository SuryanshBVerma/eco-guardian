'use strict'

const https = require('https')

const {
  HTTP_RETRY_MAX,
  HTTP_RETRY_BASE_MS,
  MAVEN_CENTRAL_URL
} = require('../config/constants')

function containsVariable (str) {
  return !!(
    str &&
    (str.includes('${') || (str.includes('$') && /[a-zA-Z]/.test(str)))
  )
}

function isResolvableVersion (version) {
  if (typeof version !== 'string') return false
  const v = version.trim()
  if (!v) return false
  if (containsVariable(v)) return false

  const upper = v.toUpperCase()
  if (
    upper === 'RELEASE' ||
    upper === 'LATEST' ||
    upper === 'NULL' ||
    upper === 'NONE' ||
    upper === 'UNSPECIFIED'
  ) {
    return false
  }

  // Version ranges and soft selectors cannot be fetched as concrete artifacts.
  if (
    v.includes('[') ||
    v.includes(']') ||
    v.includes('(') ||
    v.includes(')') ||
    v.includes(',')
  ) {
    return false
  }

  return true
}

/**
 * Fetches metadata (POM or .module) for a given GAV.
 */
async function fetchMetadata (group, name, version, type = 'module') {
  const groupPath = group.replace(/\./g, '/')
  const ext = type === 'module' ? 'module' : 'pom'
  const url = `${MAVEN_CENTRAL_URL}/${groupPath}/${name}/${version}/${name}-${version}.${ext}`

  return new Promise((resolve, reject) => {
    let retries = 0

    function attempt () {
      const req = https.get(url, (res) => {
        if (res.statusCode === 200) {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => resolve(data))
        } else if (res.statusCode === 404 && type === 'module') {
          // Drain response body so sockets can be released promptly.
          if (typeof res.resume === 'function') res.resume()
          // Fallback to POM if .module is missing
          fetchMetadata(group, name, version, 'pom')
            .then(resolve)
            .catch(reject)
        } else if (res.statusCode >= 500 && retries < HTTP_RETRY_MAX) {
          // Drain response body before scheduling retries.
          if (typeof res.resume === 'function') res.resume()
          retries++
          const t = setTimeout(
            attempt,
            HTTP_RETRY_BASE_MS * Math.pow(2, retries)
          )
          if (typeof t.unref === 'function') t.unref()
        } else {
          // Drain response body for non-success statuses.
          if (typeof res.resume === 'function') res.resume()
          reject(
            new Error(
              `Failed to fetch ${type} for ${group}:${name}:${version}: HTTP ${res.statusCode}`
            )
          )
        }
      })

      req.on('error', (err) => {
        if (retries < HTTP_RETRY_MAX) {
          retries++
          const t = setTimeout(
            attempt,
            HTTP_RETRY_BASE_MS * Math.pow(2, retries)
          )
          if (typeof t.unref === 'function') t.unref()
        } else {
          reject(err)
        }
      })

      if (typeof req.setTimeout === 'function') {
        req.setTimeout(10000, () => {
          if (typeof req.destroy === 'function') {
            req.destroy(
              new Error(
                `Timeout fetching ${type} for ${group}:${name}:${version}`
              )
            )
          }
        })
      }

      if (typeof req.on === 'function') {
        req.on('socket', (socket) => {
          if (socket && typeof socket.setKeepAlive === 'function') {
            socket.setKeepAlive(false)
          }
        })
      }
    }

    attempt()
  })
}

/**
 * Basic POM parser to extract dependencies.
 */
function parsePomDependencies (pomContent) {
  const deps = []
  // Very crude regex for POM dependencies to avoid XML parser dependency
  const depRegex = /<dependency>([\s\S]*?)<\/dependency>/g
  let match
  while ((match = depRegex.exec(pomContent)) !== null) {
    const content = match[1]
    const g = (content.match(/<groupId>([^<]+)<\/groupId>/) || [])[1]
    const a = (content.match(/<artifactId>([^<]+)<\/artifactId>/) || [])[1]
    const v = (content.match(/<version>([^<]+)<\/version>/) || [])[1]
    const scope =
      (content.match(/<scope>([^<]+)<\/scope>/) || [])[1] || 'compile'
    const optional =
      (content.match(/<optional>([^<]+)<\/optional>/) || [])[1] === 'true'

    if (
      g &&
      a &&
      v &&
      !optional &&
      !containsVariable(g) &&
      !containsVariable(a) &&
      isResolvableVersion(v)
    ) {
      deps.push({ group: g, name: a, version: v, configuration: scope })
    }
  }
  return deps
}

/**
 * Basic Gradle .module parser to extract dependencies.
 */
function parseModuleDependencies (moduleContent) {
  const deps = []
  try {
    const json = JSON.parse(moduleContent)
    // Focus on 'runtimeElements' or 'apiElements'
    const variants = json.variants || []
    for (const variant of variants) {
      if (
        variant.name === 'runtimeElements' ||
        variant.name === 'apiElements'
      ) {
        const dependencies = variant.dependencies || []
        for (const dep of dependencies) {
          const version = dep.version
            ? dep.version.requires ||
              dep.version.strictly ||
              dep.version.preferred
            : null
          if (
            !dep.group ||
            !dep.module ||
            containsVariable(dep.group) ||
            containsVariable(dep.module) ||
            !isResolvableVersion(version)
          ) {
            continue
          }

          deps.push({
            group: dep.group,
            name: dep.module,
            version,
            configuration: variant.name
          })
        }
      }
    }
  } catch (_) {
    // Ignore malformed JSON
  }
  return deps
}

module.exports = {
  fetchMetadata,
  parsePomDependencies,
  parseModuleDependencies,
  isResolvableVersion
}
