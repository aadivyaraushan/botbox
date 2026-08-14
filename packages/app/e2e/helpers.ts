import { expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export async function launchApp(opts: {
  scenario: string
  extraEnv?: Record<string, string>
}): Promise<{ app: ElectronApplication; page: Page; userData: string }> {
  const userData = mkdtempSync(join(tmpdir(), 'openbot-e2e-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:18799/?token=test-token&scenario=${opts.scenario}`,
      OPENBOT_ALLOW_INTEL: '1',
      ...(opts.extraEnv ?? {}),
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')
  return { app, page, userData }
}

export async function waitForAgentName(page: Page, name: string) {
  await expect(page.getByTestId('agent-name').filter({ hasText: name })).toBeVisible({
    timeout: 30_000,
  })
}

export async function createNamedAgent(page: Page, name: string) {
  await page.getByTestId('new-agent').click()
  await page.getByTestId('new-agent-name').fill(name)
  await page.getByTestId('new-agent-submit').click()
  const display = name.replace(/^(LoggedOut|Paused|Thinking|Memorizing)/, '') || name
  await waitForAgentName(page, display)
}

export async function clearDaemonRequests() {
  await fetch('http://127.0.0.1:18799/debug/clear-requests', { method: 'POST' }).catch(() => null)
}

export async function daemonRequests(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch('http://127.0.0.1:18799/debug/last-requests')
  if (!res.ok) return []
  return (await res.json()) as Array<Record<string, unknown>>
}

export async function clickMenu(app: ElectronApplication, path: string[]) {
  await app.evaluate(async ({ Menu }, labels) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) throw new Error('no application menu')
    let current: Electron.Menu | undefined = menu
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i]!
      const items: Electron.MenuItem[] = current?.items ?? []
      const item = items.find((it: Electron.MenuItem) => it.label === label)
      if (!item) throw new Error(`menu item not found: ${labels.slice(0, i + 1).join(' > ')}`)
      if (i === labels.length - 1) {
        item.click()
        return
      }
      current = item.submenu ?? undefined
      if (!current) throw new Error(`no submenu for ${label}`)
    }
  }, path)
}
