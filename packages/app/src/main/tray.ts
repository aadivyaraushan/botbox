import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'node:path'

let tray: Tray | null = null
let unread = false

export function getTrayUnread(): boolean {
  return unread
}

function iconPath(name: string): string {
  return join(app.getAppPath(), 'src/assets', name)
}

export function createTray(opts: {
  getWindow: () => BrowserWindow | null
  onPauseAll: () => void
  onResumeAll: () => void
}): Tray {
  const img = nativeImage.createFromPath(iconPath('menubarTemplate.png'))
  tray = new Tray(img)
  tray.setToolTip('OpenBot')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open',
        click: () => {
          const w = opts.getWindow()
          if (w) {
            w.show()
            w.focus()
          }
        },
      },
      { label: 'Pause all', click: () => opts.onPauseAll() },
      { label: 'Resume all', click: () => opts.onResumeAll() },
      { label: 'Quit', click: () => app.quit() },
    ]),
  )
  return tray
}

export function setTrayUnread(count: number): void {
  unread = count > 0
  if (!tray) return
  const name = unread ? 'menubar-unreadTemplate.png' : 'menubarTemplate.png'
  tray.setImage(nativeImage.createFromPath(iconPath(name)))
}
