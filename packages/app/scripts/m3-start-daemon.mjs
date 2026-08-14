import path from 'node:path'
import os from 'node:os'
import { Daemon } from '/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m3/packages/daemon/src/daemon.ts'

const token = process.env.OPENBOT_ADMIN_TOKEN
const home = process.env.OPENBOT_HOME
const port = Number(process.env.OPENBOT_PORT ?? 18899)
const daemon = new Daemon({
  home,
  adminToken: token,
  port,
  skipHindsightSpawn: true,
})
const { port: bound } = await daemon.start()
console.error(`[daemon] listening 127.0.0.1:${bound}`)
process.on('SIGINT', () => void daemon.stop().then(() => process.exit(0)))
process.on('SIGTERM', () => void daemon.stop().then(() => process.exit(0)))
