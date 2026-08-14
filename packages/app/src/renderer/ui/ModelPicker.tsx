type Model = { id: string; displayName: string; efforts?: string[] }

type Props = {
  models: Model[]
  model: string
  effort?: string
  disabled?: boolean
  open?: boolean
  onOpenChange?: (o: boolean) => void
  onChange: (model: string, effort?: string) => void
  error?: string | null
  onRetry?: () => void
}

export function ModelPicker({
  models,
  model,
  effort,
  disabled,
  open,
  onOpenChange,
  onChange,
  error,
  onRetry,
}: Props) {
  const current = models.find((m) => m.id === model)
  return (
    <div data-testid="model-picker" style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-ghost"
        disabled={disabled}
        aria-label="Model picker"
        onClick={() => onOpenChange?.(!open)}
      >
        {current?.displayName ?? model}
        {effort ? ` · ${effort}` : ''}
      </button>
      {open && (
        <div className="slash-menu" style={{ bottom: 'auto', top: '100%' }}>
          {error ? (
            <div className="slash-item">
              Couldn’t load models. Retry{' '}
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            </div>
          ) : (
            models
              .filter((m) => m.id !== 'codex-auto-review')
              .map((m) => (
                <div key={m.id}>
                  <button
                    type="button"
                    className="slash-item"
                    onClick={() => {
                      onChange(m.id, effort)
                      onOpenChange?.(false)
                    }}
                  >
                    {m.displayName}
                  </button>
                  {(m.efforts ?? []).map((e) => (
                    <button
                      key={`${m.id}-${e}`}
                      type="button"
                      className="slash-item"
                      onClick={() => {
                        onChange(m.id, e)
                        onOpenChange?.(false)
                      }}
                    >
                      {m.displayName} · {e}
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}
