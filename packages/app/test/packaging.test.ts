import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const builderYml = join(appRoot, 'electron-builder.yml')
const entitlements = join(appRoot, 'build', 'entitlements.mac.plist')
const afterPackPath = join(appRoot, 'scripts', 'after-pack.cjs')

describe('M2b packager config', () => {
  it('electron-builder.yml pins appId, ad-hoc identity null, extraResources, afterPack', () => {
    expect(existsSync(builderYml)).toBe(true)
    const yml = readFileSync(builderYml, 'utf8')
    expect(yml).toMatch(/appId:\s*com\.openbot\.app/)
    expect(yml).toMatch(/productName:\s*OpenBot/)
    expect(yml).toMatch(/identity:\s*null/)
    expect(yml).toMatch(/hardenedRuntime:\s*true/)
    expect(yml).toMatch(/entitlements:\s*build\/entitlements\.mac\.plist/)
    expect(yml).toContain('NSAppleEventsUsageDescription')
    expect(yml).toContain('NSScreenCaptureUsageDescription')
    expect(yml).toContain('../../resources/hindsight')
    expect(yml).toMatch(/to:\s*hindsight/)
    expect(yml).toContain('../../resources/daemon')
    expect(yml).toMatch(/to:\s*daemon/)
    expect(yml).toMatch(/afterPack:\s*scripts\/after-pack\.cjs/)
    expect(yml).not.toMatch(/app-sandbox/i)
    expect(yml).not.toMatch(/mas/i)
  })

  it('entitlements.mac.plist has apple-events and Electron JIT keys, no App Sandbox', () => {
    expect(existsSync(entitlements)).toBe(true)
    const plist = readFileSync(entitlements, 'utf8')
    expect(plist).toContain('com.apple.security.cs.allow-jit')
    expect(plist).toContain('com.apple.security.cs.allow-unsigned-executable-memory')
    expect(plist).toContain('com.apple.security.cs.disable-library-validation')
    expect(plist).toContain('com.apple.security.automation.apple-events')
    expect(plist).not.toContain('com.apple.security.app-sandbox')
  })

  it('after-pack.cjs copies helpers/openbot-axclick into Contents/Helpers', async () => {
    expect(existsSync(afterPackPath)).toBe(true)
    const tmp = mkdtempSync(join(tmpdir(), 'openbot-after-pack-'))
    try {
      const projectDir = join(tmp, 'app')
      const helpersSrcDir = join(projectDir, 'helpers')
      mkdirSync(helpersSrcDir, { recursive: true })
      const srcHelper = join(helpersSrcDir, 'openbot-axclick')
      writeFileSync(srcHelper, '#!/bin/sh\necho ok\n')
      chmodSync(srcHelper, 0o755)

      const appOutDir = join(tmp, 'out')
      const appBundle = join(appOutDir, 'OpenBot.app')
      mkdirSync(join(appBundle, 'Contents'), { recursive: true })

      const require = createRequire(import.meta.url)
      const mod = require(afterPackPath) as {
        default: (ctx: {
          electronPlatformName: string
          appOutDir: string
          packager: { projectDir: string; appInfo: { productFilename: string } }
        }) => Promise<void>
      }
      await mod.default({
        electronPlatformName: 'darwin',
        appOutDir,
        packager: {
          projectDir,
          appInfo: { productFilename: 'OpenBot' },
        },
      })

      const dest = join(appBundle, 'Contents', 'Helpers', 'openbot-axclick')
      expect(existsSync(dest)).toBe(true)
      expect(readFileSync(dest, 'utf8')).toContain('echo ok')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('after-pack.cjs throws when helper binary is missing', async () => {
    expect(existsSync(afterPackPath)).toBe(true)
    const tmp = mkdtempSync(join(tmpdir(), 'openbot-after-pack-missing-'))
    try {
      const projectDir = join(tmp, 'app')
      mkdirSync(join(projectDir, 'helpers'), { recursive: true })
      const appOutDir = join(tmp, 'out')
      mkdirSync(join(appOutDir, 'OpenBot.app', 'Contents'), { recursive: true })
      const require = createRequire(import.meta.url)
      const mod = require(afterPackPath) as {
        default: (ctx: {
          electronPlatformName: string
          appOutDir: string
          packager: { projectDir: string; appInfo: { productFilename: string } }
        }) => Promise<void>
      }
      await expect(
        mod.default({
          electronPlatformName: 'darwin',
          appOutDir,
          packager: {
            projectDir,
            appInfo: { productFilename: 'OpenBot' },
          },
        }),
      ).rejects.toThrow(/missing helper/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('packaged daemon resources', () => {
  it('resources/daemon/main.mjs exists after bundle (or fails closed)', async () => {
    const { execFileSync } = await import('node:child_process')
    const repoRoot = join(appRoot, '../..')
    const entry = join(repoRoot, 'resources', 'daemon', 'main.mjs')
    execFileSync(process.execPath, [join(repoRoot, 'scripts/dev/bundle-daemon.mjs')], {
      cwd: repoRoot,
      stdio: 'pipe',
    })
    expect(existsSync(entry)).toBe(true)
  })
})

