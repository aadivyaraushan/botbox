import { PlusMenu } from './PlusMenu'

type Tab = { id: string; kind: 'browser' | 'terminal' | 'files'; title: string }

type Props = {
  tabs: Tab[]
  activeId: string | null
  onSelect: (id: string) => void
  browserEnabled?: boolean
}

export function TabStrip({ tabs, activeId, onSelect, browserEnabled = false }: Props) {
  return (
    <div className="right-pane" data-testid="right-pane">
      <div className="tab-strip">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tab"
            data-testid={`tab-${t.kind}`}
            disabled={t.kind !== 'files' && !browserEnabled && t.kind === 'browser' ? true : false}
            title={
              t.kind === 'browser' && !browserEnabled
                ? 'Coming in a later build'
                : undefined
            }
            onClick={() => onSelect(t.id)}
            style={activeId === t.id ? { borderColor: 'var(--accent)' } : undefined}
          >
            {t.title}
          </button>
        ))}
        <PlusMenu onPick={() => {}} />
      </div>
      <div className="helper" data-testid="right-pane-body">
        {tabs.length === 0
          ? 'Coming in a later build'
          : 'Coming in a later build'}
      </div>
    </div>
  )
}
