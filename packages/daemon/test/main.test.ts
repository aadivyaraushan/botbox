import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkg = path.dirname(fileURLToPath(import.meta.url))
const main = path.join(pkg, '..', 'src', 'main.ts')
const tsx = path.join(pkg, '..', '..', '..', 'node_modules', '.bin', 'tsx')

describe('main', () => {
  it('exits when OPENBOT_ADMIN_TOKEN is unset', async () => {
    const env = { ...process.env, OPENBOT_HOME: '/tmp/openbot-main-test' }
    delete env.OPENBOT_ADMIN_TOKEN
    const child = spawn(tsx, [main], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    const err: Buffer[] = []
    child.stderr.on('data', (c) => err.push(c))
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve))
    expect(code).toBe(1)
    expect(Buffer.concat(err).toString()).toMatch(/OPENBOT_ADMIN_TOKEN/)
  })
})
