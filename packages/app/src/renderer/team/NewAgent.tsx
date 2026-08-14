import { useEffect, useRef, useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onCreate: (name: string, description: string) => Promise<string | null>
}

function deriveName(description: string): string {
  const word = description.trim().split(/\s+/)[0] ?? ''
  const clean = word.replace(/[^a-zA-Z0-9]/g, '')
  return clean ? clean[0]!.toUpperCase() + clean.slice(1).toLowerCase() : 'Agent'
}

export function NewAgent({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setError(null)
      setLoading(false)
      setTimeout(() => nameRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canSubmit = Boolean(name.trim() || description.trim())

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="New agent">
      <div className="modal">
        <h2 style={{ margin: 0, fontSize: 16 }}>New agent</h2>
        <label>
          Name
          <input
            ref={nameRef}
            data-testid="new-agent-name"
            placeholder="Ada"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (!name.trim() && description.trim()) setName(deriveName(description))
            }}
          />
        </label>
        <label>
          What they do
          <textarea
            data-testid="new-agent-description"
            placeholder="Research the repo and open a PR"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error ? <div className="error-line">{error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="new-agent-submit"
            disabled={!canSubmit || loading}
            onClick={async () => {
              setLoading(true)
              setError(null)
              const err = await onCreate(name.trim(), description.trim())
              setLoading(false)
              if (err) setError(err)
              else onClose()
            }}
          >
            {loading ? 'Creating…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
