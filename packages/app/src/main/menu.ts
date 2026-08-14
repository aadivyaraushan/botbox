import { Menu, BrowserWindow } from 'electron'

export function buildAppMenu(opts: {
  onNewAgent: () => void
  onOpenBrowser: () => void
}): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New agent',
          accelerator: 'CmdOrCtrl+N',
          click: () => opts.onNewAgent(),
        },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Browser',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => opts.onOpenBrowser(),
        },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function sendToRenderer(win: BrowserWindow | null, channel: string, payload?: unknown): void {
  win?.webContents.send(channel, payload)
}
