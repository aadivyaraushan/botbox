import os from 'node:os'
import path from 'node:path'
import { Daemon } from './daemon.js'

const token = process.env.OPENBOT_ADMIN_TOKEN
if (!token) {
  console.error('OPENBOT_ADMIN_TOKEN is unset')
  process.exit(1)
}

const home = process.env.OPENBOT_HOME ?? path.join(os.homedir(), '.openbot')
const port = Number(process.env.OPENBOT_PORT ?? 8799)

const daemon = new Daemon({
  home,
  adminToken: token,
  port,
  repoRoot: process.env.OPENBOT_REPO_ROOT,
  resourcePath: process.env.OPENBOT_HINDSIGHT_ROOT,
})

const { port: bound } = await daemon.start()
console.error(`[daemon] listening 127.0.0.1:${bound}`)

process.on('SIGINT', () => {
  void daemon.stop().then(() => process.exit(0))
})
process.on('SIGTERM', () => {
  void daemon.stop().then(() => process.exit(0))
})
