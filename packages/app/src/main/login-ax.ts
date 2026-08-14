import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'

export function resolveAxclickPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, '..', 'Helpers', 'openbot-axclick')
  }
  return join(app.getAppPath(), 'helpers', 'openbot-axclick')
}

export type AxclickRequest = {
  pid?: number
  titles: string[]
}

export type AxclickResponse = {
  ok: boolean
  error?: string
}

export async function runAxclick(
  req: AxclickRequest,
  binaryPath = resolveAxclickPath(),
): Promise<AxclickResponse> {
  return await new Promise((resolve) => {
    const child = spawn(binaryPath, [JSON.stringify(req)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => {
      out += String(d)
    })
    child.on('close', (code) => {
      try {
        const parsed = JSON.parse(out.trim() || '{}') as AxclickResponse
        resolve({ ok: Boolean(parsed.ok), error: parsed.error })
      } catch {
        resolve({ ok: false, error: code === 0 ? 'bad-stdout' : 'axclick-failed' })
      }
    })
    child.on('error', () => resolve({ ok: false, error: 'axclick-failed' }))
  })
}
