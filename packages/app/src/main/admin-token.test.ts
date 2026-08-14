import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadOrCreateAdminToken } from './admin-token'

describe('loadOrCreateAdminToken', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openbot-admin-token-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates plaintext token when encryption unavailable and reuses it', () => {
    const store = {
      isEncryptionAvailable: () => false,
      encryptString: (_s: string) => {
        throw new Error('should not encrypt')
      },
      decryptString: (_b: Buffer) => {
        throw new Error('should not decrypt')
      },
    }
    const a = loadOrCreateAdminToken({ userDataPath: dir, safeStorage: store })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    const path = join(dir, 'admin-token.bin')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(a)
    const b = loadOrCreateAdminToken({ userDataPath: dir, safeStorage: store })
    expect(b).toBe(a)
  })

  it('encrypts when safeStorage is available and decrypts on reload', () => {
    const map = new Map<string, string>()
    const store = {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => {
        const key = `enc:${s}`
        map.set(key, s)
        return Buffer.from(key, 'utf8')
      },
      decryptString: (b: Buffer) => {
        const key = b.toString('utf8')
        const v = map.get(key)
        if (!v) throw new Error('bad cipher')
        return v
      },
    }
    const a = loadOrCreateAdminToken({ userDataPath: dir, safeStorage: store })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    const raw = readFileSync(join(dir, 'admin-token.bin'))
    expect(raw.toString('utf8')).not.toBe(a)
    const b = loadOrCreateAdminToken({ userDataPath: dir, safeStorage: store })
    expect(b).toBe(a)
  })

  it('does not invent a second token when plaintext file already exists', () => {
    const existing = 'b'.repeat(64)
    const path = join(dir, 'admin-token.bin')
    writeFileSync(path, existing, { mode: 0o600 })
    chmodSync(path, 0o600)
    const store = {
      isEncryptionAvailable: () => false,
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString('utf8'),
    }
    expect(loadOrCreateAdminToken({ userDataPath: dir, safeStorage: store })).toBe(existing)
  })
})
