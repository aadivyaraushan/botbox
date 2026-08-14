import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { spawnHindsight, resolveLlmProvider } from '../src/memory/hindsight-spawn.js'

describe('hindsight-spawn', () => {
  it('missing binary does not throw; logs hindsight-missing', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await spawnHindsight({ home, port: 18888, resourcePath: path.join(home, 'missing') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing')
    expect(spy.mock.calls.some((c) => String(c[0]).includes('hindsight-missing'))).toBe(true)
    spy.mockRestore()
  })

  it('creates empty data root and copies nothing from fake resource', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hs2-'))
    const resource = path.join(home, 'bundle')
    fs.mkdirSync(path.join(resource, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(resource, 'pg0-installation', '18.1.0'), { recursive: true })
    fs.writeFileSync(path.join(resource, 'pg0-installation', '18.1.0', 'marker'), 'ok')
    fs.writeFileSync(path.join(resource, 'bin', 'hindsight-api'), '#!/bin/sh\nexit 0\n')
    fs.chmodSync(path.join(resource, 'bin', 'hindsight-api'), 0o755)
    fs.writeFileSync(path.join(resource, 'SHOULD_NOT_COPY'), 'nope')
    const recorded: Array<{ cmd: string; args: string[]; env?: NodeJS.ProcessEnv }> = []
    const result = await spawnHindsight({
      home,
      port: 19999,
      resourcePath: resource,
      spawnFn: ((cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
        recorded.push({ cmd, args, env: opts.env })
        return { kill() {}, pid: 1, stdout: null, stderr: null } as never
      }) as never,
    })
    expect(result.ok).toBe(true)
    const data = path.join(home, 'hindsight', 'data')
    expect(fs.existsSync(data)).toBe(true)
    expect(fs.existsSync(path.join(data, 'SHOULD_NOT_COPY'))).toBe(false)
    expect(recorded[0]?.args).toContain('127.0.0.1')
  })

  it('sets HOME under data root, real CODEX_HOME, database URL, and seeds pg0 installation', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-env-'))
    const resource = path.join(home, 'bundle')
    fs.mkdirSync(path.join(resource, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(resource, 'pg0-installation', '18.1.0', 'bin'), { recursive: true })
    fs.writeFileSync(path.join(resource, 'pg0-installation', '18.1.0', 'bin', 'postgres'), 'fake')
    fs.writeFileSync(path.join(resource, 'bin', 'hindsight-api'), '#!/bin/sh\nexit 0\n')
    fs.chmodSync(path.join(resource, 'bin', 'hindsight-api'), 0o755)
    const recorded: Array<{ env?: NodeJS.ProcessEnv }> = []
    const result = await spawnHindsight({
      home,
      port: 19991,
      resourcePath: resource,
      spawnFn: ((_cmd: string, _args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
        recorded.push({ env: opts.env })
        return { kill() {}, pid: 1, stdout: null, stderr: null } as never
      }) as never,
    })
    expect(result.ok).toBe(true)
    const dataRoot = path.join(home, 'hindsight', 'data')
    const env = recorded[0]?.env
    expect(env?.HOME).toBe(dataRoot)
    expect(env?.CODEX_HOME).toBe(path.join(home, 'codex-home'))
    expect(env?.HINDSIGHT_API_DATABASE_URL).toBe('pg0://hindsight')
    expect(env?.CLAUDE_CONFIG_DIR).toBe(path.join(home, 'claude-config'))
    expect(fs.existsSync(path.join(dataRoot, '.pg0', 'installation', '18.1.0', 'bin', 'postgres'))).toBe(
      true,
    )
  })

  it('fails with missing when pg0-installation is absent from bundle', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hs-nopg-'))
    const resource = path.join(home, 'bundle')
    fs.mkdirSync(path.join(resource, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(resource, 'bin', 'hindsight-api'), '#!/bin/sh\nexit 0\n')
    fs.chmodSync(path.join(resource, 'bin', 'hindsight-api'), 0o755)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await spawnHindsight({
      home,
      port: 19992,
      resourcePath: resource,
      spawnFn: (() => {
        throw new Error('should not spawn')
      }) as never,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('missing')
    expect(spy.mock.calls.some((c) => String(c[0]).includes('hindsight-pg-missing'))).toBe(true)
    spy.mockRestore()
  })

  it('port-busy retries port+1', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hs3-'))
    const resource = path.join(home, 'bundle')
    fs.mkdirSync(path.join(resource, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(resource, 'pg0-installation', '18.1.0'), { recursive: true })
    fs.writeFileSync(path.join(resource, 'pg0-installation', '18.1.0', 'marker'), 'ok')
    fs.writeFileSync(path.join(resource, 'bin', 'hindsight-api'), '#!/bin/sh\nexit 0\n')
    fs.chmodSync(path.join(resource, 'bin', 'hindsight-api'), 0o755)
    const net = await import('node:net')
    const blocker = net.createServer()
    await new Promise<void>((r) => blocker.listen(18765, '127.0.0.1', () => r()))
    const ports: number[] = []
    const result = await spawnHindsight({
      home,
      port: 18765,
      resourcePath: resource,
      spawnFn: ((_c: string, args: readonly string[]) => {
        const i = args.indexOf('--port')
        ports.push(Number(args[i + 1]))
        return { kill() {} } as never
      }) as never,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.port).toBe(18766)
    expect(ports[0]).toBe(18766)
    blocker.close()
  })

  it('resolveLlmProvider switches on credentials; login-finished path uses claude-code', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hs4-'))
    expect(resolveLlmProvider(home)).toBe('openai-codex')
    fs.mkdirSync(path.join(home, 'claude-config'), { recursive: true })
    fs.writeFileSync(path.join(home, 'claude-config', '.credentials.json'), '{}')
    expect(resolveLlmProvider(home)).toBe('claude-code')
  })
})
