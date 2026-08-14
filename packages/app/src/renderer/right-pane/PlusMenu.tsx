import { useState } from 'react'

type Props = {
  onPick: (kind: 'browser' | 'terminal' | 'files') => void
  browserEnabled?: boolean
  terminalEnabled?: boolean
}

export function PlusMenu({ onPick, browserEnabled = true, terminalEnabled = true }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="plus-menu" data-testid="plus-menu">
      <button type="button" className="btn-ghost" aria-label="Add tab" onClick={() => setOpen((o) => !o)}>
        +
      </button>
      {open ? (
        <div className="plus-menu-list" role="menu">
          <button
            type="button"
            disabled={!terminalEnabled}
            title={terminalEnabled ? undefined : 'Coming in a later build'}
            data-testid="plus-terminal"
            onClick={() => {
              onPick('terminal')
              setOpen(false)
            }}
          >
            Terminal
          </button>
          <button
            type="button"
            disabled={!browserEnabled}
            title={browserEnabled ? undefined : 'Coming in a later build'}
            data-testid="plus-browser"
            onClick={() => {
              onPick('browser')
              setOpen(false)
            }}
          >
            Browser
          </button>
          <button
            type="button"
            disabled
            title="Coming in a later build"
            data-testid="plus-files"
            onClick={() => onPick('files')}
          >
            Files
          </button>
        </div>
      ) : null}
    </div>
  )
}
