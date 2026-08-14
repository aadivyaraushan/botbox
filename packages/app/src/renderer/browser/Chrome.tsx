import { useEffect, useRef, useState } from 'react'

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
            let next = draft.trim()
            if (next && !/^https?:\/\//i.test(next)) next = 'https://' + next
            onUrlChange(next)
            void window.openbot?.browser.navigate({ tabId, url: next })
          }}
        >
          <input
            data-testid="browser-url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Address"
          />
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
