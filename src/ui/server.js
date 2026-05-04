'use strict'

const fsp = require('fs/promises')
const http = require('http')
const path = require('path')
const {
  UI_MANIFEST,
  buildCommand,
  validateState
} = require('./command-builder')

const PUBLIC_DIR = path.join(__dirname, 'public')

function sendJson (res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(JSON.stringify(payload, null, 2))
}

function safeAssetPath (requestPath) {
  const normalized = path.normalize(requestPath).replace(/^([/\\])+/, '')
  const resolved = path.join(PUBLIC_DIR, normalized)
  if (path.relative(PUBLIC_DIR, resolved).startsWith('..')) {
    return null
  }
  return resolved
}

async function readAsset (name) {
  const resolved = safeAssetPath(name)
  if (!resolved) return null
  try {
    return await fsp.readFile(resolved)
  } catch (_) {
    return null
  }
}

async function collectBody (req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  if (chunks.length === 0) return ''
  return Buffer.concat(chunks).toString('utf8')
}

async function startUiServer (options = {}, state = {}) {
  const normalized = validateState(options)
  const initialState = normalized.state
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readAsset('index.html')
      if (!html) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('UI assets missing')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      res.end(html)
      return
    }

    if (req.method === 'GET' && url.pathname === '/app.js') {
      const asset = await readAsset('app.js')
      if (!asset) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      res.end(asset)
      return
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      const asset = await readAsset('styles.css')
      if (!asset) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      res.end(asset)
      return
    }

    if (req.method === 'GET' && url.pathname === '/favicon.png') {
      const asset = await readAsset('favicon.png')
      if (!asset) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Not found')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      })
      res.end(asset)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      sendJson(res, 200, {
        manifest: UI_MANIFEST,
        initialState,
        command: buildCommand(initialState, { platform: process.platform }),
        state
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/command') {
      const body = await collectBody(req)
      let payload
      try {
        payload = body ? JSON.parse(body) : {}
      } catch (error) {
        sendJson(res, 400, { errors: ['Invalid JSON body.'] })
        return
      }
      const result = validateState(payload)
      if (result.errors.length > 0) {
        sendJson(res, 400, { errors: result.errors })
        return
      }
      sendJson(res, 200, {
        command: buildCommand(result.state, { platform: process.platform })
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  })

  const address = await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address())
    })
  })

  const url = `http://127.0.0.1:${address.port}/`
  process.stdout.write(`eco-guardian UI listening on ${url}\n`)

  return {
    server,
    url,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
  }
}

module.exports = {
  startUiServer
}
