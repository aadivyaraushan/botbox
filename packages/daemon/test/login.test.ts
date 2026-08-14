import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseClaudeLoginUrl, parseCodexDeviceAuth } from '../src/login/parse.js'

const fix = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'login')

describe('login parse', () => {
  it('parses Claude auth URL fixture', () => {
    const raw = fs.readFileSync(path.join(fix, 'claude-auth-url.txt'), 'utf8')
    const url = parseClaudeLoginUrl(raw)
    expect(url).toMatch(/^https:\/\/claude\.com\//)
    expect(url).not.toMatch(/Paste/)
    expect(() => new URL(url!)).not.toThrow()
  })

  it('does not glue Paste onto state when rejoining would otherwise', () => {
    const raw =
      'visit: https://claude.com/cai/oauth/authorize?state=abcXYZ\nPaste code here if prompted >\n'
    const url = parseClaudeLoginUrl(raw)
    expect(url).toBe('https://claude.com/cai/oauth/authorize?state=abcXYZ')
  })

  it('parses wrapped Claude URL', () => {
    const raw = fs.readFileSync(path.join(fix, 'claude-auth-url-wrapped.txt'), 'utf8')
    const url = parseClaudeLoginUrl(raw)
    expect(url).toMatch(/^https:\/\//)
  })

  it('parses Codex device auth fixture', () => {
    const raw = fs.readFileSync(path.join(fix, 'codex-device-auth.txt'), 'utf8')
    const parsed = parseCodexDeviceAuth(raw)
    expect(parsed?.url).toContain('/codex/device')
    expect(parsed?.userCode).toMatch(/^[A-Z0-9-]+$/)
  })
})
