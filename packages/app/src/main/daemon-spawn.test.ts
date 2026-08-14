import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveDaemonSpawn } from './daemon-spawn'

describe('resolveDaemonSpawn', () => {
  const adminToken = 'a'.repeat(64)
  const baseEnv = { PATH: '/usr/bin', OPENBOT_PORT: '8799' }

  it('packaged uses resourcesPath/daemon/main.mjs with ELECTRON_RUN_AS_NODE and execPath', () => {
    const resourcesPath = '/Apps/OpenBot.app/Contents/Resources'
    const execPath = '/Apps/OpenBot.app/Contents/MacOS/OpenBot'
    const spec = resolveDaemonSpawn({
      isPackaged: true,
      resourcesPath,
      repoRoot: '/repo',
      execPath,
      adminToken,
      env: baseEnv,
    })
    expect(spec.command).toBe(execPath)
    expect(spec.args).toEqual([join(resourcesPath, 'daemon', 'main.mjs')])
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(spec.env.OPENBOT_ADMIN_TOKEN).toBe(adminToken)
    expect(spec.env.OPENBOT_REPO_ROOT).toBe(join(resourcesPath, 'daemon'))
    expect(spec.env.OPENBOT_HINDSIGHT_ROOT).toBe(join(resourcesPath, 'hindsight'))
    expect(spec.args.join(' ')).not.toContain('tsx')
    expect(spec.command).not.toContain('tsx')
  })

  it('dev uses repoRoot tsx + packages/daemon/src/main.ts', () => {
    const repoRoot = '/Users/dev/openbot'
    const spec = resolveDaemonSpawn({
      isPackaged: false,
      resourcesPath: '/unused',
      repoRoot,
      execPath: '/usr/local/bin/electron',
      adminToken,
      env: baseEnv,
    })
    expect(spec.command).toBe(join(repoRoot, 'node_modules/.bin/tsx'))
    expect(spec.args).toEqual([join(repoRoot, 'packages/daemon/src/main.ts')])
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(spec.env.OPENBOT_ADMIN_TOKEN).toBe(adminToken)
  })
})
