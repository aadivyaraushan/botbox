import { useState } from 'react'

type Row = {
  id: string
  name: string
  status: string
  attention?: boolean
  unread?: boolean
}

type Props = {
  rows: Row[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
}

export function TeamList({ rows, selectedId, onSelect, onRename, onDelete }: Props) {
  const [menuId, setMenuId] = useState<string | null>(null)
  return (
    <div data-testid="team-list">
      {rows.map((r) => (
        <div
          key={r.id}
          className={`team-row ${selectedId === r.id ? 'selected' : ''}`}
          data-testid={`team-row-${r.id}`}
          onClick={() => {
            setMenuId(null)
            onSelect(r.id)
          }}
        >
          <div style={{ flex: 1 }}>
            <div>
              <span data-testid="agent-name">{r.name}</span>{' '}
              <span className="status-word" data-testid="agent-status">
                {r.status}
              </span>
            </div>
          </div>
          {r.attention ? <span className="dot" data-testid="attention-dot" title="Needs attention" /> : null}
          {r.unread ? <span className="dot unread" data-testid="unread-dot" title="Unread" /> : null}
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Agent menu"
              className="btn-ghost"
              onClick={() => setMenuId((id) => (id === r.id ? null : r.id))}
            >
              …
            </button>
            {menuId === r.id ? (
              <div className="plus-menu-list">
                <button
                  type="button"
                  onClick={() => {
                    setMenuId(null)
                    onRename(r.id)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuId(null)
                    onDelete(r.id)
                  }}
                >
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
