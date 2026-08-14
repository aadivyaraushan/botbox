import { useMemo, useRef, useState } from 'react'
import { ModelPicker } from '../ui/ModelPicker'
import { ContextDonut } from '../ui/ContextDonut'
import { SlashMenu } from '../ui/SlashMenu'

type Model = { id: string; displayName: string; efforts?: string[] }
type Primary = 'send' | 'stop' | 'resume' | 'disabled-stop'

type Props = {
  agentName: string
  primary: Primary
  draft: string
  onDraftChange: (v: string) => void
  models: Model[]
  model: string
  effort?: string
  contextUsed: number | null
  contextWindow: number | null
  spendUsdToday: number
  modelDisabled?: boolean
  pickerOpen?: boolean
  onPickerOpenChange?: (o: boolean) => void
  onSetModel: (model: string, effort?: string) => void
  onPrimary: () => void
  onSubmitText: (text: string) => void
  onSlash: (cmd: string, args: string) => void | Promise<void>
  slashItems: Array<{ id: string; label: string }>
  pauseHint?: string | null
  slashError?: string | null
  onClearSlashError?: () => void
}

function primaryLabel(p: Primary): string {
  if (p === 'stop' || p === 'disabled-stop') return 'Stop agent'
  if (p === 'resume') return 'Resume agent'
  return 'Send message'
}

function primaryGlyph(p: Primary): string {
  if (p === 'stop' || p === 'disabled-stop') return '■'
  if (p === 'resume') return '▶'
  return '↑'
}

export function Composer({
  agentName,
  primary,
  draft,
  onDraftChange,
  models,
  model,
  effort,
  contextUsed,
  contextWindow,
  spendUsdToday,
  modelDisabled,
  pickerOpen,
  onPickerOpenChange,
  onSetModel,
  onPrimary,
  onSubmitText,
  onSlash,
  slashItems,
  pauseHint,
  slashError,
  onClearSlashError,
}: Props) {
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashActive, setSlashActive] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)

  const filtered = useMemo(() => {
    if (!draft.startsWith('/')) return []
    const token = draft.slice(1).split(/\s+/)[0] ?? ''
    return slashItems.filter((i) => i.id.startsWith(token) || i.label.toLowerCase().includes(token.toLowerCase()))
  }, [draft, slashItems])

  return (
    <div className="composer" data-testid="composer" style={{ position: 'relative' }}>
      <div className="composer-bar">
        <ModelPicker
          models={models}
          model={model}
          effort={effort}
          disabled={modelDisabled}
          open={pickerOpen}
          onOpenChange={onPickerOpenChange}
          onChange={onSetModel}
        />
        <ContextDonut used={contextUsed} window={contextWindow} />
        <span className="spend" data-testid="spend-chip">
          {spendUsdToday > 0 ? `$${spendUsdToday.toFixed(2)}` : '$0.00'}
        </span>
        <button
          type="button"
          className="composer-primary"
          data-testid="composer-primary"
          data-mode={primary}
          aria-label={primaryLabel(primary)}
          title={primaryLabel(primary)}
          disabled={primary === 'disabled-stop' || (primary === 'send' && !draft.trim())}
          onClick={onPrimary}
        >
          {primaryGlyph(primary)}
        </button>
      </div>
      {slashOpen && filtered.length > 0 ? (
        <SlashMenu
          items={filtered}
          active={slashActive}
          onPick={(id) => {
            void onSlash(id, '')
            setSlashOpen(false)
            onDraftChange('')
          }}
        />
      ) : null}
      <textarea
        ref={ta}
        className="composer-input"
        data-testid="composer-input"
        placeholder={`Message ${agentName}`}
        value={draft}
        onChange={(e) => {
          const v = e.target.value
          onDraftChange(v)
          onClearSlashError?.()
          setSlashOpen(v.startsWith('/'))
          setSlashActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setSlashOpen(false)
            onClearSlashError?.()
            return
          }
          if (slashOpen && filtered.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setSlashActive((i) =>
              e.key === 'ArrowDown'
                ? (i + 1) % filtered.length
                : (i - 1 + filtered.length) % filtered.length,
            )
            return
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (slashOpen && filtered[slashActive]) {
              void onSlash(filtered[slashActive]!.id, '')
              setSlashOpen(false)
              onDraftChange('')
              return
            }
            if (draft.startsWith('/')) {
              const [cmd, ...rest] = draft.slice(1).split(/\s+/)
              void onSlash(cmd ?? '', rest.join(' '))
              return
            }
            if (primary === 'paused' as never) return
            onSubmitText(draft)
          }
        }}
      />
      {pauseHint ? <div className="hint" data-testid="resume-hint">{pauseHint}</div> : null}
      {slashError ? (
        <div className="error-line" data-testid="slash-error">
          {slashError}
        </div>
      ) : null}
      {/* no separate Pause control */}
    </div>
  )
}
