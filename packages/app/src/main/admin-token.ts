import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

export type SafeStorageLike = {
  isEncryptionAvailable: () => boolean
  encryptString: (plain: string) => Buffer
  decryptString: (encrypted: Buffer) => string
}

export type LoadAdminTokenOpts = {
  userDataPath: string
  safeStorage: SafeStorageLike
  randomHex?: () => string
}

const TOKEN_FILE = 'admin-token.bin'

export function loadOrCreateAdminToken(opts: LoadAdminTokenOpts): string {
  const path = join(opts.userDataPath, TOKEN_FILE)
  const gen = opts.randomHex ?? (() => randomBytes(32).toString('hex'))

  if (existsSync(path)) {
    const raw = readFileSync(path)
    if (opts.safeStorage.isEncryptionAvailable()) {
      try {
        return opts.safeStorage.decryptString(raw)
      } catch {
        // Fall through: treat as plaintext legacy / unavailable decrypt
      }
    }
    const text = raw.toString('utf8').trim()
    if (/^[0-9a-f]{64}$/i.test(text)) return text.toLowerCase()
    throw new Error(`[admin-token] unreadable ${path}`)
  }

  const token = gen()
  if (opts.safeStorage.isEncryptionAvailable()) {
    const cipher = opts.safeStorage.encryptString(token)
    writeFileSync(path, cipher, { mode: 0o600 })
  } else {
    writeFileSync(path, token, { mode: 0o600 })
  }
  try {
    chmodSync(path, 0o600)
  } catch {
    /* ignore */
  }
  return token
}
