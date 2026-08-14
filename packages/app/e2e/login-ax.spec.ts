import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const fake = join(dirname(fileURLToPath(import.meta.url)), '../test/fakes/fake-axclick.sh')

function runFake(env: NodeJS.ProcessEnv, argvJson: string): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', [fake, argvJson], { env: { ...process.env, ...env } })
    let out = ''
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.on('close', (code) => resolve({ code, out: out.trim() }))
  })
}

test.describe('login-ax fake helper', () => {
  test('button-not-found returns error JSON', async () => {
    const { code, out } = await runFake({ OPENBOT_FAKE_AXCLICK: 'button-not-found' }, JSON.stringify({ titles: ['Allow'] }))
    expect(code).toBe(1)
    expect(JSON.parse(out)).toEqual({ ok: false, error: 'button-not-found' })
  })

  test('title matcher covers Allow|Continue|Authorize|Approve', async () => {
    for (const title of ['Allow', 'Continue', 'Authorize', 'Approve']) {
      const { out } = await runFake(
        { OPENBOT_FAKE_AXCLICK: 'ok' },
        JSON.stringify({ titles: [title] }),
      )
      expect(JSON.parse(out).ok).toBe(true)
    }
  })

  test('deny-accessibility path', async () => {
    const { code, out } = await runFake(
      { OPENBOT_FAKE_AXCLICK: 'accessibility-denied' },
      JSON.stringify({ titles: ['Allow'] }),
    )
    expect(code).toBe(1)
    expect(JSON.parse(out)).toEqual({ ok: false, error: 'accessibility-denied' })
  })

  test('does not call cliclick', async () => {
    const src = readFileSync(fake, 'utf8')
    expect(src.includes('cliclick')).toBe(false)
    const { out } = await runFake({ OPENBOT_FAKE_AXCLICK: 'button-not-found' }, JSON.stringify({ titles: ['Allow'] }))
    expect(out).toContain('button-not-found')
    expect(out).not.toContain('cliclick')
  })
})
