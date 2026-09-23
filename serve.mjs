#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { Agent, request as httpsRequest } from 'node:https'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN_NODE_MAJOR = 16
const nodeMajor = Number(process.versions.node.split('.')[0])
if (Number.isFinite(nodeMajor) && nodeMajor < MIN_NODE_MAJOR) {
  console.error(
    `\n  This needs Node ${MIN_NODE_MAJOR} or newer — you have ${process.versions.node}.` +
      `\n  Install a current version from https://nodejs.org and run this again.\n`,
  )
  process.exit(1)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')

if (!existsSync(ROOT)) {
  console.error(
    '\n  No `dist` folder next to this file. Run `npm run build` first.\n',
  )
  process.exit(1)
}

const API_HOST = 'api.awsevents.com'

const PORTS = [8484, 8485, 8486, 8487, 8488, 8489]

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const upstream = new Agent({ keepAlive: true, keepAliveMsecs: 30_000, maxSockets: 12 })

function proxy(req, res) {
  const path = req.url.replace(/^\/api/, '') || '/'
  const headers = { ...req.headers, host: API_HOST }
  delete headers.connection
  delete headers['accept-encoding']

  const forward = httpsRequest(
    { host: API_HOST, path, method: req.method, headers, agent: upstream },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  forward.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: `Upstream request failed: ${err.message}` }))
  })

  req.pipe(forward)
}

function serveFile(res, filePath, status = 200) {
  res.writeHead(status, {
    'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
    'cache-control': filePath.endsWith('index.html')
      ? 'no-store'
      : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api')) {
    proxy(req, res)
    return
  }

  let requested
  try {
    requested = decodeURIComponent((req.url ?? '/').split('?')[0])
  } catch {
    requested = '/'
  }
  const candidate = normalize(join(ROOT, requested))
  const inside = candidate === ROOT || candidate.startsWith(ROOT + sep)

  if (inside && existsSync(candidate) && statSync(candidate).isFile()) {
    serveFile(res, candidate)
    return
  }

  serveFile(res, join(ROOT, 'index.html'))
})

let attempt = 0

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && attempt + 1 < PORTS.length) {
    attempt += 1
    console.log(`  port ${PORTS[attempt - 1]} in use, trying ${PORTS[attempt]}…`)
    server.listen(PORTS[attempt], '127.0.0.1')
    return
  }
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  All available ports are in use (${PORTS.join(', ')}).\n` +
        '  Free one and try again — AWS sign-in only works on these.\n',
    )
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})

server.on('listening', () => {
  console.log(
    `\n  AWS Events Website\n\n` +
      `  →  http://localhost:${PORTS[attempt]}\n\n` +
      `  Press Ctrl-C to stop.\n`,
  )
})

server.listen(PORTS[0], '127.0.0.1')
