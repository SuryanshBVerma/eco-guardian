'use strict'

const fs = require('fs')
const crypto = require('crypto')

async function quickFingerprint (filePath) {
  try {
    const stats = fs.statSync(filePath)
    return `${stats.size}-${stats.mtimeMs}`
  } catch (error) {
    return null
  }
}

async function contentFingerprint (filePath) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', () => resolve(null))
  })
}

function projectDigest (inputFingerprints) {
  const combined = Object.entries(inputFingerprints)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, fp]) => `${path}:${fp}`)
    .join('|')
  return crypto.createHash('sha256').update(combined).digest('hex')
}

module.exports = {
  quickFingerprint,
  contentFingerprint,
  projectDigest
}
