#!/usr/bin/env node
import { WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import {
  exitCodeFor,
  formatPreflightFailure,
  runLoginScreenPreflight,
} from './login-screen-preflight.mjs'

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

if (process.platform === 'darwin') {
  const { result } = runLoginScreenPreflight()
  if (!result.ok) {
    console.error(formatPreflightFailure(result))
    process.exit(exitCodeFor(result))
  }
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
        const args = ['-a', 'Google Chrome', '--', msg.event.url]
        if (!args[3]?.startsWith('http')) {
          console.error('[login.mjs] refusing non-http login URL')
          process.exit(1)
        }
        spawn('open', args, { stdio: 'ignore' })
      })
    }
  }
  if (msg.event?.kind === 'login-finished') {
    process.exit(msg.event.ok ? 0 : 1)
  }
})
