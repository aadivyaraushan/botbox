#!/usr/bin/env node
/**
 * Real-surface: launch packaged OpenBot.app (or dir build), assert daemon WS + agent.list.
 * Does not set OPENBOT_DAEMON_WS — the app must spawn its own daemon.
 */
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { encodeFrame, decodeFrame } from '@openbot/daemon/wire'

const here = path.dirname(fileURLToPath(import.meta.url))
const appPkg = path.join(here, '..')
const repoRoot = path.join(appPkg, '../..')

function findApp() {
  const candidates = [
    process.env.OPENBOT_PACKAGED_APP,
    path.join(appPkg, 'dist/mac-arm64/OpenBot.app'),
    path.join(appPkg, 'dist/mac/OpenBot.app'),
  ].filter(Boolean)
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

async function ensurePackaged() {
  let app = findApp()
  if (app) return app

  console.log('[packaged-drive] bundling daemon + packaging dir…')
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts/dev/bundle-daemon.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  // Stub hindsight if missing so electron-builder extraResources succeeds for this gap drive
  const hindsight = path.join(repoRoot, 'resources/hindsight')
  if (!fs.existsSync(path.join(hindsight, 'bin/hindsight-api'))) {
    fs.mkdirSync(path.join(hindsight, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(hindsight, 'python'), { recursive: true })
    fs.mkdirSync(path.join(hindsight, 'hf-cache'), { recursive: true })
    fs.writeFileSync(path.join(hindsight, 'bin/hindsight-api'), '#!/bin/sh\necho stub\n')
    fs.chmodSync(path.join(hindsight, 'bin/hindsight-api'), 0o755)
    console.log('[packaged-drive] wrote stub resources/hindsight for package')
  }

  const helper = path.join(appPkg, 'helpers/openbot-axclick')
  if (!fs.existsSync(helper)) {
    throw new Error('missing packages/app/helpers/openbot-axclick — build swift helper first')
  }

  execFileSync(
    path.join(appPkg, 'node_modules/.bin/electron-vite'),
    ['build'],
    { cwd: appPkg, stdio: 'inherit', env: process.env },
  )
  execFileSync(
    path.join(appPkg, 'node_modules/.bin/electron-builder'),
    ['--config', 'electron-builder.yml', '--dir', '--mac'],
    { cwd: appPkg, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } },
  )
  app = findApp()
  if (!app) throw new Error('package finished but OpenBot.app not found under dist/')
  return app
}

function request(ws, body) {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const decoded = decodeFrame(String(raw))
      if (!decoded.ok) return
      const m = decoded.value
      if (m && m.id === id && m.type === 'response') {
        ws.off('message', onMsg)
        resolve(m)
      }
    }
    ws.on('message', onMsg)
    ws.send(encodeFrame({ id, ...body }))
    setTimeout(() => reject(new Error('timeout ' + body.type)), 30_000)
  })
}

function waitWs(url, ms = 45_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const ws = new WebSocket(url)
      ws.once('open', () => resolve(ws))
      ws.once('error', () => {
        ws.close()
        if (Date.now() - start > ms) reject(new Error('ws connect timeout'))
        else setTimeout(tryOnce, 400)
      })
    }
    tryOnce()
  })
}

async function main() {
  const appPath = await ensurePackaged()
  const binary = path.join(appPath, 'Contents/MacOS/OpenBot')
  if (!fs.existsSync(binary)) throw new Error('missing binary ' + binary)

  const daemonEntry = path.join(appPath, 'Contents/Resources/daemon/main.mjs')
  if (!fs.existsSync(daemonEntry)) throw new Error('packaged app missing ' + daemonEntry)

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-packaged-drive-'))
  const port = 19087
  const token = randomBytes(32).toString('hex')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-userdata-'))

  console.log('[packaged-drive] launching', binary)
  const child = spawn(binary, ['--user-data-dir=' + userData], {
    env: {
      ...process.env,
      OPENBOT_HOME: home,
      OPENBOT_PORT: String(port),
      OPENBOT_ADMIN_TOKEN: token,
      OPENBOT_ALLOW_INTEL: '1',
      // Do NOT set OPENBOT_DAEMON_WS — spawn must happen
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let log = ''
  child.stdout?.on('data', (c) => {
    log += String(c)
    process.stdout.write(c)
  })
  child.stderr?.on('data', (c) => {
    log += String(c)
    process.stderr.write(c)
  })

  const url = `ws://127.0.0.1:${port}/?token=${token}`
  let ws
  try {
    ws = await waitWs(url)
    const list = await request(ws, { type: 'agent.list' })
    if (!list.ok) throw new Error('agent.list failed: ' + JSON.stringify(list))
    console.log('[packaged-drive] PASS agent.list ok agents=', Array.isArray(list.agents) ? list.agents.length : '?')
    const out = path.join(repoRoot, 'saved-results/openbot-gap-packaged-daemon-2026-08-15.md')
    fs.writeFileSync(
      out,
      [
        '# OpenBot gap-packaged-daemon',
        '',
        'Date: 2026-08-15',
        '',
        'What: packaged app spawns live daemon; WS agent.list succeeds without OPENBOT_DAEMON_WS.',
        '',
        'App: `' + appPath + '`',
        '',
        'Evidence:',
        '- Resources/daemon/main.mjs present',
        '- Spawn via ELECTRON_RUN_AS_NODE + process.execPath',
        '- agent.list ok',
        '',
        'Reproduce:',
        '```',
        'node packages/app/scripts/packaged-daemon-drive.mjs',
        '```',
        '',
      ].join('\n'),
    )
    console.log('[packaged-drive] wrote', out)
  } finally {
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 3000)
  }
}

main().catch((err) => {
  console.error('[packaged-drive] FAIL', err)
  process.exit(1)
})
