import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type Props = {
  agentId: string
  tabId: string
  active: boolean
}

export function TerminalPane({ agentId, tabId, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({ convertEol: true, fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    void window.openbot?.terminal.create({ agentId, tabId })
    const off = window.openbot?.terminal.onData((ev) => {
      if (ev.tabId === tabId) term.write(ev.data)
    })
    term.onData((data) => {
      void window.openbot?.terminal.write({ tabId, data })
    })
    const onResize = () => fit.fit()
    window.addEventListener('resize', onResize)
    return () => {
      off?.()
      window.removeEventListener('resize', onResize)
      term.dispose()
      termRef.current = null
    }
  }, [agentId, tabId])

  useEffect(() => {
    if (active) void window.openbot?.terminal.focus({ agentId, tabId })
  }, [active, agentId, tabId])

  return <div className="terminal-pane" data-testid="terminal-pane" ref={hostRef} />
}
