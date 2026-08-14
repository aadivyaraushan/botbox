#!/usr/bin/env node
import { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'

const token = process.env.OPENBOT_ADMIN_TOKEN
if (!token) {
  console.error('OPENBOT_ADMIN_TOKEN is unset')
  process.exit(1)
}
const port = process.env.OPENBOT_PORT ?? '8799'
const agentId = process.argv[2]
const harness = process.argv[3] ?? 'claude-code'
if (!agentId) {
  console.error('usage: login.mjs <agentId> [claude-code|codex]')
  process.exit(1)
}

const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`)
ws.on('open', () => {
  ws.send(JSON.stringify({ id: randomUUID(), type: 'harness.startLogin', agentId, harness }))
})
ws.on('message', (data) => {
  const msg = JSON.parse(String(data))
  if (msg.event?.kind === 'login-challenge') {
    console.log(msg.event.url)
    if (process.platform === 'darwin') {
      import('node:child_process').then(({ spawn }) => {
        spawn('open', ['-a', 'Google Chrome', '--', msg.event.url], { stdio: 'ignore' })
      })
    }
  }
  if (msg.event?.kind === 'login-finished') {
    process.exit(msg.event.ok ? 0 : 1)
  }
})
