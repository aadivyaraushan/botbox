import { PlusMenu } from './PlusMenu'
import { Chrome } from '../browser/Chrome'
import { TerminalPane } from '../terminal/TerminalPane'
import { FilesPane } from '../files/FilesPane'

export type RightTab = {
  id: string
  kind: 'browser' | 'terminal' | 'files'
  title: string
  url?: string
}

type Props = {
  tabs: RightTab[]
  activeId: string | null
  agentId: string | null
  held: boolean
  filesSearchToken?: number
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onPick: (kind: 'browser' | 'terminal' | 'files') => void
  onUrlChange: (tabId: string, url: string) => void
  onReturnControl: () => void
  onTakeControl: () => void
}

export function TabStrip({
  tabs,
  activeId,
  agentId,
  held,
  filesSearchToken = 0,
  onSelect,
  onClose,
  onPick,
  onUrlChange,
  onReturnControl,
  onTakeControl,
}: Props) {
  if (tabs.length === 0) return null
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]!
  return (
    <div className="right-pane" data-testid="right-pane">
      <div className="tab-strip">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tab"
            data-testid={`tab-${t.kind}`}
            data-tab-id={t.id}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(t.id)
            }}
            style={active.id === t.id ? { borderColor: 'var(--accent)' } : undefined}
          >
            <span>{t.title}</span>
            <span
              role="button"
              aria-label={`Close ${t.title}`}
              data-testid={`tab-close-${t.id}`}
              onClick={(e) => {
                e.stopPropagation()
                onClose(t.id)
              }}
            >
              ×
            </span>
          </button>
        ))}
        <PlusMenu onPick={onPick} browserEnabled terminalEnabled filesEnabled />
      </div>
      <div className="right-pane-body" data-testid="right-pane-body">
        {active.kind === 'browser' && agentId ? (
          <Chrome
            agentId={agentId}
            tabId={active.id}
            url={active.url ?? 'about:blank'}
            held={held}
            onUrlChange={(url) => onUrlChange(active.id, url)}
            onReturnControl={onReturnControl}
            onTakeControl={onTakeControl}
          />
        ) : null}
        {active.kind === 'terminal' && agentId ? (
          <TerminalPane agentId={agentId} tabId={active.id} active={active.id === activeId} />
        ) : null}
        {active.kind === 'files' && agentId ? (
          <FilesPane agentId={agentId} searchFocusToken={filesSearchToken} />
        ) : null}
      </div>
    </div>
  )
}
