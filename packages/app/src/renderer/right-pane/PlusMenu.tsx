import { useState } from 'react'

type Props = {
  onPick: (kind: 'browser' | 'terminal' | 'files') => void
}

export function PlusMenu({ onPick }: Props) {
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
            disabled
            title="Coming in a later build"
            onClick={() => onPick('terminal')}
          >
            Terminal
          </button>
          <button
            type="button"
            disabled
            title="Coming in a later build"
            onClick={() => onPick('browser')}
          >
            Browser
          </button>
          <button
            type="button"
            disabled
            title="Coming in a later build"
            onClick={() => onPick('files')}
          >
            Files
          </button>
        </div>
      ) : null}
    </div>
  )
}
