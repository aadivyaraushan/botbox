#!/usr/bin/env node
/**
 * Composed package proof: real Hindsight + live packaged daemon in one OpenBot.app.
 * Fails closed if resources/hindsight is missing or stub-sized. Never writes a stub.
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

/** Stub trees are ~4KB; real bake is ~2GB class. Refuse anything under 100MB. */
const MIN_HINDSIGHT_BYTES = 100 * 1024 * 1024

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

function duBytes(dir) {
  const out = execFileSync('du', ['-sk', dir], { encoding: 'utf8' })
  const kb = Number(out.trim().split(/\s+/)[0])
  if (!Number.isFinite(kb)) throw new Error('du failed for ' + dir)
  return kb * 1024
}

function assertRealHindsight(rootLabel, hindsightRoot) {
  const api = path.join(hindsightRoot, 'bin/hindsight-api')
  if (!fs.existsSync(api)) {
    throw new Error(
      `[composed-drive] FAIL closed: missing ${rootLabel}/bin/hindsight-api — run DEST=resources/hindsight ./scripts/dev/bundle-hindsight.sh (or copy a real bake). Never stub.`,
    )
  }
  for (const sub of ['python', 'hf-cache']) {
    const p = path.join(hindsightRoot, sub)
    if (!fs.existsSync(p)) {
      throw new Error(`[composed-drive] FAIL closed: missing ${rootLabel}/${sub}`)
    }
  }
  const bytes = duBytes(hindsightRoot)
  if (bytes < MIN_HINDSIGHT_BYTES) {
    throw new Error(
      `[composed-drive] FAIL closed: ${rootLabel} is ${bytes} bytes (stub class). Need real ~2GB bake, not a 4KB stub.`,
    )
  }
  console.log(`[composed-drive] ok real hindsight at ${hindsightRoot} size=${bytes} bytes`)
  return bytes
}

async function ensurePackaged() {
  const sourceHindsight = path.join(repoRoot, 'resources/hindsight')
  assertRealHindsight('resources/hindsight', sourceHindsight)

  let app = findApp()
  if (app) {
    const packagedHindsight = path.join(app, 'Contents/Resources/hindsight')
    const daemonEntry = path.join(app, 'Contents/Resources/daemon/main.mjs')
    if (fs.existsSync(daemonEntry) && fs.existsSync(path.join(packagedHindsight, 'bin/hindsight-api'))) {
      try {
        assertRealHindsight('OpenBot.app/.../hindsight', packagedHindsight)
        return app
      } catch (err) {
        console.log(
          '[composed-drive] existing app failed real-hindsight check; rebuilding…',
          String(err.message || err),
        )
      }
    }
  }

  console.log('[composed-drive] bundling daemon + packaging dir…')
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts/dev/bundle-daemon.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  assertRealHindsight('resources/hindsight', sourceHindsight)

  const helper = path.join(appPkg, 'helpers/openbot-axclick')
  if (!fs.existsSync(helper)) {
    throw new Error('missing packages/app/helpers/openbot-axclick — build swift helper first')
  }

  execFileSync(path.join(appPkg, 'node_modules/.bin/electron-vite'), ['build'], {
    cwd: appPkg,
    stdio: 'inherit',
    env: process.env,
  })
  execFileSync(
    path.join(appPkg, 'node_modules/.bin/electron-builder'),
    ['--config', 'electron-builder.yml', '--dir', '--mac'],
    {
      cwd: appPkg,
      stdio: 'inherit',
      env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    },
  )
  app = findApp()
  if (!app) throw new Error('package finished but OpenBot.app not found under dist/')

  assertRealHindsight('OpenBot.app/.../hindsight', path.join(app, 'Contents/Resources/hindsight'))
  const daemonEntry = path.join(app, 'Contents/Resources/daemon/main.mjs')
  if (!fs.existsSync(daemonEntry)) throw new Error('packaged app missing ' + daemonEntry)
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

function waitWs(url, ms = 60_000) {
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

function writeSizeNote(appPath, hindsightBytes, appBytes) {
  const out = path.join(repoRoot, 'saved-results/openbot-app-size-2026-08-15.md')
  const appHuman = execFileSync('du', ['-sh', appPath], { encoding: 'utf8' }).trim().split(/\s+/)[0]
  const hHuman = execFileSync('du', ['-sh', path.join(appPath, 'Contents/Resources/hindsight')], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)[0]
  fs.writeFileSync(
    out,
    [
      '# OpenBot composed packaged app size',
      '',
      'Date: 2026-08-15',
      '',
      'What: one OpenBot.app with real Hindsight (~2GB class) and live packaged daemon. No size cap.',
      '',
      `App: \`${appPath}\``,
      '',
      '| Artifact | Size |',
      '|---|---|',
      `| OpenBot.app | **${appHuman}** (${appBytes} bytes via \`du -sk\`) |`,
      `| Contents/Resources/hindsight | **${hHuman}** (${hindsightBytes} bytes) |`,
      `| Contents/Resources/daemon/main.mjs | present |`,
      '',
      'Evidence:',
      '- `resources/hindsight` is real bake (not 4KB stub); composed drive fails closed under 100MB',
      '- Packaged `Contents/Resources/hindsight/bin/hindsight-api` + `python` + `hf-cache`',
      '- Packaged `Contents/Resources/daemon/main.mjs`; app spawn without `OPENBOT_DAEMON_WS`',
      '- `agent.list` ok',
      '',
      'Open (not claimed closed): Allow-click login still needs human Screen Recording re-grant after each ad-hoc rebuild (M2b).',
      '',
      'Reproduce:',
      '```',
      'DEST=resources/hindsight ./scripts/dev/bundle-hindsight.sh',
      'node packages/app/scripts/composed-packaged-drive.mjs',
      'bash scripts/dev/verify-packaged-app.sh packages/app/dist/mac-arm64/OpenBot.app',
      '```',
      '',
    ].join('\n'),
  )
  console.log('[composed-drive] wrote', out)
}

async function main() {
  const appPath = await ensurePackaged()
  const binary = path.join(appPath, 'Contents/MacOS/OpenBot')
  if (!fs.existsSync(binary)) throw new Error('missing binary ' + binary)

  const daemonEntry = path.join(appPath, 'Contents/Resources/daemon/main.mjs')
  if (!fs.existsSync(daemonEntry)) throw new Error('packaged app missing ' + daemonEntry)

  const packagedHindsight = path.join(appPath, 'Contents/Resources/hindsight')
  const hindsightBytes = assertRealHindsight('OpenBot.app/.../hindsight', packagedHindsight)
  const appBytes = duBytes(appPath)

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-composed-drive-'))
  const port = 19088
  const token = randomBytes(32).toString('hex')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-userdata-'))

  console.log('[composed-drive] launching', binary)
  const child = spawn(binary, ['--user-data-dir=' + userData], {
    env: {
      ...process.env,
      OPENBOT_HOME: home,
      OPENBOT_PORT: String(port),
      OPENBOT_ADMIN_TOKEN: token,
      OPENBOT_ALLOW_INTEL: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (c) => process.stdout.write(c))
  child.stderr?.on('data', (c) => process.stderr.write(c))

  const url = `ws://127.0.0.1:${port}/?token=${token}`
  let ws
  try {
    ws = await waitWs(url)
    const list = await request(ws, { type: 'agent.list' })
    if (!list.ok) throw new Error('agent.list failed: ' + JSON.stringify(list))
    console.log(
      '[composed-drive] PASS agent.list ok agents=',
      Array.isArray(list.agents) ? list.agents.length : '?',
    )
    writeSizeNote(appPath, hindsightBytes, appBytes)

    const verify = path.join(repoRoot, 'scripts/dev/verify-packaged-app.sh')
    execFileSync('bash', [verify, appPath], { cwd: repoRoot, stdio: 'inherit' })
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
  console.error('[composed-drive] FAIL', err)
  process.exit(1)
})
