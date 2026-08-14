#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const token = process.env.OPENBOT_ADMIN_TOKEN
if (!token) {
  console.error('OPENBOT_ADMIN_TOKEN is unset')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const port = process.env.OPENBOT_PORT ?? '8799'
const home = process.env.OPENBOT_HOME ?? `${process.env.HOME}/.openbot`

const child = spawn('pnpm', ['--filter', '@openbot/daemon', 'start'], {
  cwd: root,
  env: { ...process.env, OPENBOT_ADMIN_TOKEN: token, OPENBOT_PORT: String(port), OPENBOT_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let readyResolve
const ready = new Promise((r) => { readyResolve = r })
child.stderr.on('data', (c) => {
  const s = String(c)
  process.stderr.write(s)
  if (s.includes('listening')) readyResolve()
})
child.stdout?.on?.('data', (c) => process.stdout.write(c))

await Promise.race([
  ready,
  new Promise((_, rej) => setTimeout(() => rej(new Error('daemon start timeout')), 30_000)),
])

const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`)
await new Promise((resolve, reject) => {
  ws.once('open', resolve)
  ws.once('error', reject)
})

function req(body) {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const onMsg = (data) => {
      const msg = JSON.parse(String(data))
      if (msg.id === id) {
        ws.off('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, ...body }))
    setTimeout(() => reject(new Error('timeout')), 120_000)
  })
}

const events = []
ws.on('message', (d) => {
  try {
    events.push(JSON.parse(String(d)))
  } catch {}
})

const created = await req({ type: 'agent.create', name: `Smoke${Date.now() % 100000}` })
if (!created.ok) {
  console.error('create failed', created)
  process.exit(1)
}
const agentId = created.agent.id
const send = await req({ type: 'chat.send', agentId, text: 'Reply with one short sentence.' })
if (!send.ok) {
  console.error('send failed', send)
  process.exit(1)
}

const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  const hasReasoning = events.some((e) => e.event?.kind === 'reasoning-text')
  const finished = events.some((e) => e.event?.kind === 'turn-finished')
  if (hasReasoning && finished) break
  await new Promise((r) => setTimeout(r, 200))
}

const reasoning = events.filter((e) => e.event?.kind === 'reasoning-text')
if (reasoning.length < 1) {
  console.error('smoke: no reasoning-text events — stop and revise (or retry with thinking adaptive already set)')
  process.exit(1)
}
console.log(`smoke ok: ${reasoning.length} reasoning-text events`)
await req({ type: 'chat.stop', agentId })
ws.close()
child.kill('SIGTERM')
process.exit(0)
