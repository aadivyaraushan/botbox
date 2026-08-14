#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const { Daemon } = await import(pathToFileURL(path.join(root, 'packages/daemon/src/daemon.ts')).href)

const token = process.env.OPENBOT_ADMIN_TOKEN
const home = process.env.OPENBOT_HOME
const port = Number(process.env.OPENBOT_PORT ?? 18840)
if (!token || !home) {
  console.error('start-real-daemon: OPENBOT_ADMIN_TOKEN and OPENBOT_HOME required')
  process.exit(1)
}

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
