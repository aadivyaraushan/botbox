import { useEffect, useRef, useState } from 'react'
import { resolveAddressBar } from './suggest-url'

type Props = {
  agentId: string
  tabId: string
  url: string
  held: boolean
  onUrlChange: (url: string) => void
  onReturnControl: () => void
  onTakeControl: () => void
}

export function Chrome({ agentId, tabId, url, held, onUrlChange, onReturnControl, onTakeControl }: Props) {
  const [draft, setDraft] = useState(url)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(url), [url])

  useEffect(() => {
    const el = slotRef.current
    if (!el) return
    const sendBounds = () => {
      const r = el.getBoundingClientRect()
      void window.openbot?.browser.setBounds({
        agentId,
        tabId,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      })
    }
    sendBounds()
    const ro = new ResizeObserver(sendBounds)
    ro.observe(el)
    window.addEventListener('resize', sendBounds)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sendBounds)
      void window.openbot?.browser.setBounds({
        agentId,
        tabId,
        rect: { x: -2000, y: 0, width: 1280, height: 800 },
      })
    }
  }, [agentId, tabId])

  async function refreshSuggestions(q: string) {
    const res = (await window.openbot?.history?.suggest({ agentId, q })) as
      | { urls?: string[] }
      | undefined
    setSuggestions(res?.urls ?? [])
  }

  function navigateTo(nextRaw: string) {
    const next = resolveAddressBar(nextRaw, suggestions)
    setDraft(next)
    onUrlChange(next)
    setSuggestions([])
    void window.openbot?.browser.navigate({ tabId, url: next })
  }

  return (
    <div className="browser-chrome" data-testid="browser-chrome">
      <div className="browser-toolbar">
        <button type="button" aria-label="Back" onClick={() => void window.openbot?.browser.back({ tabId })}>
          ←
        </button>
        <button type="button" aria-label="Forward" onClick={() => void window.openbot?.browser.forward({ tabId })}>
          →
        </button>
        <button type="button" aria-label="Reload" onClick={() => void window.openbot?.browser.reload({ tabId })}>
          ↻
        </button>
        <form
          className="browser-url-form"
          onSubmit={(e) => {
            e.preventDefault()
            navigateTo(draft)
          }}
        >
          <input
            data-testid="browser-url"
            value={draft}
            list="browser-url-suggestions"
            onChange={(e) => {
              const v = e.target.value
              setDraft(v)
              void refreshSuggestions(v)
            }}
            aria-label="Address"
          />
          <datalist id="browser-url-suggestions" data-testid="browser-url-suggestions">
            {suggestions.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </form>
        {held ? (
          <div className="driving-bar" data-testid="youre-driving">
            <span>You’re driving</span>
            <button type="button" data-testid="return-control" onClick={onReturnControl}>
              Return control
            </button>
          </div>
        ) : (
          <button type="button" className="btn-ghost" data-testid="take-control" onClick={onTakeControl}>
            Take control
          </button>
        )}
      </div>
      <div className="browser-slot" data-testid="browser-slot" ref={slotRef} />
    </div>
  )
}
