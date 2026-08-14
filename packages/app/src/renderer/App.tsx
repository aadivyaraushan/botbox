import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HarnessEvent } from '@openbot/protocol'
import { randomUUID } from './uuid'
import { TeamList } from './team/TeamList'
import { NewAgent } from './team/NewAgent'
import { PartTimeline } from './thread/PartTimeline'
import { Composer } from './thread/Composer'
import { emptyTurn, foldTurnEvent, type FoldTurn } from './thread/fold/fold-turn'
import { HarnessSwitcher } from './ui/HarnessSwitcher'
import { TabStrip, type RightTab } from './right-pane/TabStrip'
import { PlusMenu } from './right-pane/PlusMenu'
import { refreshAgentsList } from './daemon-list-sync'

type AgentConfig = {
  id: string
  name: string
  slug: string
  harness: 'claude-code' | 'codex'
  model: string
  effort?: string
  fast?: boolean
  memoryBankId: string
  createdAt: string
}

type Runtime = {
  agentId: string
  state: string
  queueCount: number
  spendUsdToday: number
  harnessAuth: { 'claude-code': string; codex: string }
  humanControl: { held: boolean }
  talkingToAgentId: string | null
  contextUsed: number | null
  contextWindow: number | null
  sessionId: string | null
  mcp: Array<{ name: 'openbot' | 'hindsight'; url: string; last: 'ok' | 'fail' | null }>
}

type Banner = {
  kind: 'banner'
  bannerId: string
  agentId: string
  type: string
  message: string
  actions: string[]
  harness?: string
  host?: string
}

type Turn = FoldTurn

type Model = { id: string; displayName: string; efforts?: string[] }

type AgentBundle = {
  agent: AgentConfig
  runtime: Runtime
  banners: Banner[]
  turns: Turn[]
  unread: boolean
  historyLoaded: boolean
}

function statusWord(state: string): string {
  switch (state) {
    case 'idle':
      return 'idle'
    case 'thinking':
    case 'memorizing':
    case 'compacting':
      return 'working'
    case 'needs-you':
      return 'needs you'
    case 'paused':
      return 'paused'
    case 'error':
      return 'error'
    default:
      return state
  }
}

function primaryFor(state: string): 'send' | 'stop' | 'resume' | 'disabled-stop' {
  if (state === 'thinking' || state === 'needs-you') return 'stop'
  if (state === 'memorizing' || state === 'compacting') return 'disabled-stop'
  if (state === 'paused') return 'resume'
  return 'send'
}

const CLAUDE_SLASH = [
  { id: 'model', label: '/model' },
  { id: 'effort', label: '/effort' },
  { id: 'compact', label: '/compact' },
  { id: 'status', label: '/status' },
  { id: 'usage', label: '/usage' },
  { id: 'context', label: '/context' },
  { id: 'mcp', label: '/mcp' },
  { id: 'init', label: '/init' },
  { id: 'fast', label: '/fast' },
  { id: 'clear', label: '/clear' },
]

const CODEX_SLASH = [
  { id: 'model', label: '/model' },
  { id: 'reasoning', label: '/reasoning' },
  { id: 'compact', label: '/compact' },
  { id: 'status', label: '/status' },
  { id: 'usage', label: '/usage' },
  { id: 'context', label: '/context' },
  { id: 'mcp', label: '/mcp' },
  { id: 'init', label: '/init' },
  { id: 'fast', label: '/fast' },
  { id: 'clear', label: '/clear' },
]

async function api(body: Record<string, unknown>) {
  return window.openbot.request({ id: randomUUID(), ...body })
}

export function App() {
  const [agents, setAgents] = useState<Record<string, AgentBundle>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [models, setModels] = useState<Model[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [slashError, setSlashError] = useState<string | null>(null)
  const [pauseHint, setPauseHint] = useState<string | null>(null)
  const [skills, setSkills] = useState<Array<{ name: string; body: string }>>([])
  const [connected, setConnected] = useState(true)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [tabsByAgent, setTabsByAgent] = useState<Record<string, RightTab[]>>({})
  const tabsRef = useRef(tabsByAgent)
  tabsRef.current = tabsByAgent
  const [activeByAgent, setActiveByAgent] = useState<Record<string, string | null>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [filesSearchToken, setFilesSearchToken] = useState(0)
  const [answerChat, setAnswerChat] = useState<{ agentId: string; partId: string } | null>(null)
  const [waitModal, setWaitModal] = useState<null | { mode: 'quit' | 'pause-all'; names: string[] }>(
    null,
  )
  const streamStarted = useRef(false)
  const lastEnvelopeId = useRef(0)
  const quitConfirmed = useRef(false)
  const agentsRef = useRef(agents)
  agentsRef.current = agents

  const selected = selectedId ? agents[selectedId] : null

  const rightTabs = selectedId ? tabsByAgent[selectedId] ?? [] : []
  const activeTabId = selectedId ? activeByAgent[selectedId] ?? null : null

  const addTab = useCallback(
    (agentId: string, kind: 'browser' | 'terminal' | 'files', tabId?: string, url?: string) => {
      const id = tabId ?? randomUUID()
      setTabsByAgent((prev) => {
        const cur = prev[agentId] ?? []
        const ofKind = cur.filter((x) => x.kind === kind)
        let next = cur
        if (ofKind.length >= 12) {
          const oldest = ofKind[0]!
          next = cur.filter((x) => x.id !== oldest.id)
          setToast(`Closed oldest ${kind} tab`)
        }
        if (next.some((x) => x.id === id)) return { ...prev, [agentId]: next }
        const title = kind === 'browser' ? 'Browser' : kind === 'terminal' ? 'Terminal' : 'Files'
        return {
          ...prev,
          [agentId]: [
            ...next,
            { id, kind, title, url: url ?? (kind === 'browser' ? 'about:blank' : undefined) },
          ],
        }
      })
      setActiveByAgent((prev) => ({ ...prev, [agentId]: id }))
      return id
    },
    [],
  )

  const closeTab = useCallback((agentId: string, tabId: string) => {
    const closing = tabsRef.current[agentId]?.find((t) => t.id === tabId)
    void (async () => {
      if (closing?.kind === 'browser') await window.openbot.browser.destroy({ tabId })
      if (closing?.kind === 'terminal') await window.openbot.terminal.kill({ tabId })
      setTabsByAgent((prev) => {
        const cur = prev[agentId] ?? []
        if (!cur.some((x) => x.id === tabId)) return prev
        const next = cur.filter((x) => x.id !== tabId)
        const activeNext = next[next.length - 1]?.id ?? null
        setActiveByAgent((a) => ({ ...a, [agentId]: activeNext }))
        return { ...prev, [agentId]: next }
      })
    })()
  }, [])

  const attentionCount = useMemo(() => {
    let n = 0
    for (const a of Object.values(agentsRef.current)) {
      const blocked =
        a.runtime.state === 'needs-you' ||
        a.banners.some((b) => ['needs-login', 'needs-site', 'memory-error'].includes(b.type))
      if (blocked || a.unread) n += 1
    }
    return n
  }, [agents])

  useEffect(() => {
    void window.openbot?.setUnread(attentionCount)
  }, [attentionCount])

  const upsertRuntime = useCallback((runtime: Runtime) => {
    setAgents((prev) => {
      const cur = prev[runtime.agentId]
      if (!cur) return prev
      return { ...prev, [runtime.agentId]: { ...cur, runtime } }
    })
  }, [])

  const applyEnvelope = useCallback(
    (env: Record<string, unknown>) => {
      if (typeof env.id === 'number') lastEnvelopeId.current = Math.max(lastEnvelopeId.current, env.id)
      const agentId = String(env.agentId ?? '')
      if (env.channel === 'daemon') {
        const event = env.event as Record<string, unknown>
        if (event.kind === 'agent-runtime') {
          upsertRuntime(event.runtime as Runtime)
        } else if (event.kind === 'banner') {
          setAgents((prev) => {
            const cur = prev[agentId]
            if (!cur) return prev
            const banners = [
              ...cur.banners.filter(
                (b) => b.bannerId !== event.bannerId && b.type !== (event as Banner).type,
              ),
              event as unknown as Banner,
            ]
            return { ...prev, [agentId]: { ...cur, banners } }
          })
        }
        return
      }
      if (env.channel === 'harness') {
        const turnId = String(env.turnId)
        const raw = env.event as Record<string, unknown>
        const kind = String(raw.kind ?? (raw as { type?: string }).type ?? '')
        const event = { ...raw, kind } as HarnessEvent
        setAgents((prev) => {
          const cur = prev[agentId]
          if (!cur) return prev
          let turns = [...cur.turns]
          let unread = cur.unread
          const idx = turns.findIndex((x) => x.id === turnId)
          let base: FoldTurn =
            idx >= 0
              ? { ...turns[idx]!, parts: [...turns[idx]!.parts] }
              : emptyTurn(turnId)
          if (event.kind === 'turn-created') {
            base = foldTurnEvent(base, event)
            if (event.role === 'user' && event.text) {
              const busy = ['thinking', 'needs-you', 'memorizing', 'compacting'].includes(
                cur.runtime.state,
              )
              if (busy) base = { ...base, queued: true }
            }
          } else if (event.kind === 'turn-finished') {
            base = foldTurnEvent(base, event)
          } else {
            base = foldTurnEvent(base, event)
            if (
              event.kind === 'reasoning-text' ||
              event.kind === 'assistant-text' ||
              event.kind === 'ask-user-question' ||
              (event.kind === 'peer-message' && event.direction === 'received')
            ) {
              if (selectedId !== agentId) unread = true
            }
            if (event.kind === 'compacted' && event.reason === 'manual') {
              base = { ...base, source: 'compact' }
            }
          }
          if (idx >= 0) turns[idx] = base
          else turns.push(base)
          return { ...prev, [agentId]: { ...cur, turns, unread } }
        })
        if (
          event.kind === 'ask-user-question-status' &&
          (event.status === 'answered' || event.status === 'cancelled')
        ) {
          const partId = event.partId
          setAnswerChat((cur) =>
            cur && cur.agentId === agentId && cur.partId === partId ? null : cur,
          )
        }
      }
    },
    [selectedId, upsertRuntime],
  )

  const refreshList = useCallback(async () => {
    const res = await refreshAgentsList({ api })
    if (!res?.ok) return
    const items = (res.agents as Array<{ agent: AgentConfig; runtime: Runtime; banners: Banner[] }>) ?? []
    setAgents((prev) => {
      const next: Record<string, AgentBundle> = {}
      for (const it of items) {
        const old = prev[it.agent.id]
        next[it.agent.id] = {
          agent: it.agent,
          runtime: it.runtime,
          banners: it.banners ?? [],
          turns: old?.turns ?? [],
          unread: old?.unread ?? false,
          historyLoaded: old?.historyLoaded ?? false,
        }
        void window.openbot.rememberSlug?.({ agentId: it.agent.id, slug: it.agent.slug })
      }
      return next
    })
  }, [])

  const loadHistory = useCallback(async (agentId: string) => {
    const res = await api({ type: 'chat.history', agentId })
    if (!res.ok) return
    const turns = (res.turns as Turn[]) ?? []
    if (typeof res.lastEnvelopeId === 'number') {
      lastEnvelopeId.current = Math.max(lastEnvelopeId.current, res.lastEnvelopeId)
    }
    setAgents((prev) => {
      const cur = prev[agentId]
      if (!cur) return prev
      return { ...prev, [agentId]: { ...cur, turns, historyLoaded: true, unread: false } }
    })
  }, [])

  const loadModels = useCallback(async (agentId: string) => {
    const res = await api({ type: 'agent.models', agentId })
    if (!res.ok) {
      setModels([])
      return
    }
    setModels(((res.models as Model[]) ?? []).filter((m) => m.id !== 'codex-auto-review'))
  }, [])

  const loadSkills = useCallback(async (agentId: string) => {
    const res = await api({ type: 'agent.skills', agentId })
    if (res.ok) setSkills((res.skills as Array<{ name: string; body: string }>) ?? [])
  }, [])

  useEffect(() => {
    const offEvent = window.openbot.onEvent((ev) => {
      const v = ev as Record<string, unknown>
      if (v.type === 'event.stream.meta' && v.replayReset) {
        void refreshList()
        return
      }
      if (v.channel === 'harness' || v.channel === 'daemon') applyEnvelope(v)
    })
    const offStatus = window.openbot.onStatus((s) => {
      setConnected(s.connected)
      if (s.connected) void refreshList()
    })
    const offMenu = window.openbot.onMenu((a) => {
      if (a.action === 'new-agent') setNewOpen(true)
      if (a.action === 'browser') {
        if (selectedId) addTab(selectedId, 'browser')
      }
      if (a.action === 'pause-all') {
        const waiters = Object.values(agentsRef.current)
          .filter((bundle) =>
            bundle.turns.some((t) =>
              t.parts.some((p) => p.type === 'ask-user-question' && p.status === 'open'),
            ),
          )
          .map((b) => b.agent.name)
        if (waiters.length > 0) {
          setWaitModal({ mode: 'pause-all', names: waiters })
        } else {
          for (const id of Object.keys(agentsRef.current)) void api({ type: 'agent.pause', agentId: id })
        }
      }
      if (a.action === 'resume-all') {
        for (const id of Object.keys(agentsRef.current)) {
          if (agentsRef.current[id]?.runtime.state === 'paused') void api({ type: 'agent.resume', agentId: id })
        }
      }
      if (a.action === 'quit-check') {
        const waiters = Object.values(agentsRef.current).filter((bundle) =>
          bundle.turns.some((t) =>
            t.parts.some((p) => p.type === 'ask-user-question' && p.status === 'open'),
          ),
        )
        if (waiters.length > 0) {
          setWaitModal({ mode: 'quit', names: waiters.map((b) => b.agent.name) })
        } else {
          quitConfirmed.current = true
          void window.openbot?.confirmQuit?.()
        }
      }
    })
    const offSelect = window.openbot.onSelectAgent((id) => setSelectedId(id))

    void (async () => {
      if (!streamStarted.current) {
        streamStarted.current = true
        await api({ type: 'event.stream' })
      }
      await refreshList()
    })()

    const offBrowserNeed = window.openbot.onBrowserTabNeeded((ev) => {
      addTab(ev.agentId, 'browser', ev.tabId)
    })
    const offTermNeed = window.openbot.onTerminalTabNeeded((ev) => {
      addTab(ev.agentId, 'terminal', ev.tabId)
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        if (selectedId) addTab(selectedId, 'terminal')
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (selectedId) {
          const tabs = tabsByAgent[selectedId] ?? []
          const hasFiles = tabs.some((t) => t.kind === 'files')
          if (!hasFiles) addTab(selectedId, 'files')
          else {
            const filesTab = tabs.find((t) => t.kind === 'files')
            if (filesTab) setActiveByAgent((prev) => ({ ...prev, [selectedId]: filesTab.id }))
          }
          setFilesSearchToken((n) => n + 1)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        const active = selectedId ? activeByAgent[selectedId] : null
        if (selectedId && active) {
          e.preventDefault()
          closeTab(selectedId, active)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offEvent()
      offStatus()
      offMenu()
      offSelect()
      offBrowserNeed()
      offTermNeed()
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, addTab, closeTab, activeByAgent, tabsByAgent])

  const selectedPresent = Boolean(selectedId && agents[selectedId])
  const selectedHistoryLoaded = selectedId ? Boolean(agents[selectedId]?.historyLoaded) : true

  useEffect(() => {
    if (!selectedId || !selectedPresent) return
    if (!selectedHistoryLoaded) void loadHistory(selectedId)
    void loadModels(selectedId)
    void loadSkills(selectedId)
    void (async () => {
      const res = await api({ type: 'agent.get', agentId: selectedId })
      if (!res.ok) return
      setAgents((prev) => {
        const cur = prev[selectedId]
        if (!cur) return prev
        return {
          ...prev,
          [selectedId]: {
            ...cur,
            agent: (res.agent as AgentConfig) ?? cur.agent,
            runtime: (res.runtime as Runtime) ?? cur.runtime,
            banners: (res.banners as Banner[]) ?? cur.banners,
            unread: false,
          },
        }
      })
    })()
  }, [selectedId, selectedPresent, selectedHistoryLoaded, loadHistory, loadModels, loadSkills])

  const rows = Object.values(agentsRef.current).map((a) => ({
    id: a.agent.id,
    name: a.agent.name,
    status: statusWord(a.runtime.state),
    attention:
      a.runtime.state === 'needs-you' ||
      a.banners.some((b) => ['needs-login', 'needs-site', 'memory-error'].includes(b.type)),
    unread: a.unread,
  }))

  const slashItems = useMemo(() => {
    const base = selected?.agent.harness === 'codex' ? CODEX_SLASH : CLAUDE_SLASH
    const skillItems = skills.map((s) => ({ id: s.name, label: `/${s.name}` }))
    return [...base, ...skillItems].filter((i) => i.id !== 'plan')
  }, [selected, skills])

  async function createAgent(name: string, description: string): Promise<string | null> {
    const body: Record<string, unknown> = { type: 'agent.create' }
    if (name) body.name = name
    if (description) body.description = description
    const res = await api(body)
    if (!res.ok) {
      const err = String(res.error)
      if (err === 'need-name-or-description') return 'Add a name or a short description.'
      if (err === 'invalid-name') return 'That name isn’t usable. Try letters or numbers.'
      if (err === 'slug-taken') return 'Someone already has that name.'
      return 'Couldn’t create agent. Try again.'
    }
    const agent = res.agent as AgentConfig
    const runtime = (res.runtime as Runtime) ?? {
      agentId: agent.id,
      state: 'idle',
      queueCount: 0,
      spendUsdToday: 0,
      harnessAuth: { 'claude-code': 'logged-in', codex: 'logged-in' },
      humanControl: { held: false },
      talkingToAgentId: null,
      contextUsed: null,
      contextWindow: null,
      sessionId: null,
      mcp: [],
    }
    const banners = (res.banners as Banner[]) ?? []
    setAgents((prev) => ({
      ...prev,
      [agent.id]: {
        agent,
        runtime,
        banners,
        turns: prev[agent.id]?.turns ?? [],
        unread: false,
        historyLoaded: false,
      },
    }))
    setSelectedId(agent.id)
    await refreshList()
    await loadHistory(agent.id)
    return null
  }

  async function handlePrimary() {
    if (!selected) return
    if (answerChat && answerChat.agentId === selected.agent.id) {
      if (draft.trim()) await sendAskResponse(draft)
      return
    }
    const state = selected.runtime.state
    if (state === 'thinking' || state === 'needs-you') {
      await api({ type: 'agent.pause', agentId: selected.agent.id })
      return
    }
    if (state === 'paused') {
      await api({ type: 'agent.resume', agentId: selected.agent.id })
      setPauseHint(null)
      return
    }
    if (draft.trim()) {
      await sendChat(draft)
    }
  }

  async function sendAskAnswer(partId: string, answers: Record<string, string>, response?: string) {
    if (!selected) return
    const body: Record<string, unknown> = {
      type: 'ask.answer',
      agentId: selected.agent.id,
      partId,
      answers,
    }
    if (response !== undefined) body.response = response
    const res = await api(body)
    if (!res.ok) return
    setAnswerChat(null)
    setAgents((prev) => {
      const cur = prev[selected.agent.id]
      if (!cur) return prev
      const turns = cur.turns.map((t) => ({
        ...t,
        parts: t.parts.map((p) => {
          if (p.id !== partId || p.type !== 'ask-user-question') return p
          return {
            ...p,
            status: 'answered' as const,
            answers,
            ...(response !== undefined ? { response } : {}),
          }
        }),
      }))
      return { ...prev, [selected.agent.id]: { ...cur, turns } }
    })
    setDraft('')
  }

  async function sendAskResponse(text: string) {
    if (!selected || !answerChat) return
    const trimmed = text.trim()
    if (!trimmed) return
    await sendAskAnswer(answerChat.partId, {}, trimmed)
  }

  async function sendChat(text: string) {
    if (!selected) return
    if (answerChat && answerChat.agentId === selected.agent.id) {
      await sendAskResponse(text)
      return
    }
    const trimmed = text.trim()
    if (!trimmed) return
    const state = selected.runtime.state
    if (state === 'paused') {
      setPauseHint('Resume to send')
      return
    }
    const res = await api({ type: 'chat.send', agentId: selected.agent.id, text: trimmed })
    if (!res.ok && res.error === 'needs-login') {
      // leave draft; banner pushed by fake/daemon
      return
    }
    if (res.ok) setDraft('')
    setPauseHint(null)
  }

  async function handleSlash(cmd: string, args: string) {
    if (!selected) return
    if (cmd === 'plan') {
      setSlashError('Unknown command. Try /model or /compact.')
      return
    }
    if (cmd === 'model' || cmd === 'effort' || cmd === 'reasoning') {
      setPickerOpen(true)
      setDraft('')
      return
    }
    if (cmd === 'compact') {
      await api({ type: 'agent.compact', agentId: selected.agent.id })
      setDraft('')
      return
    }
    if (cmd === 'clear') {
      await api({ type: 'agent.clear', agentId: selected.agent.id })
      setDraft('')
      return
    }
    if (cmd === 'fast') {
      await api({ type: 'agent.setFast', agentId: selected.agent.id, fast: !selected.agent.fast })
      setDraft('')
      return
    }
    if (cmd === 'init') {
      const text =
        selected.agent.harness === 'codex'
          ? 'Write an AGENTS.md in this workspace that describes who you are and how you work here. Use the files already in this folder.'
          : 'Write a CLAUDE.md in this workspace that describes who you are and how you work here. Use the files already in this folder.'
      await sendChat(text)
      setDraft('')
      return
    }
    if (cmd === 'status' || cmd === 'usage' || cmd === 'context' || cmd === 'mcp') {
      setDraft('')
      return
    }
    const skill = skills.find((s) => s.name === cmd)
    if (skill) {
      const body = args ? `${skill.body}\n${args}` : skill.body
      await sendChat(body)
      setDraft('')
      return
    }
    setSlashError('Unknown command. Try /model or /compact.')
  }

  const primary =
    selected && answerChat && answerChat.agentId === selected.agent.id
      ? 'send'
      : selected
        ? primaryFor(selected.runtime.state)
        : 'send'
  const teamLoginStrip =
    Object.keys(agentsRef.current).length === 0 &&
    false /* fake may not expose global auth; M2 first-run strip optional with empty team */

  return (
    <div className={rightTabs.length > 0 ? 'app-shell has-right-pane' : 'app-shell no-right-pane'}>
      <div className="col" data-testid="team-column">
        <h1 className="heading">Team</h1>
        <div style={{ padding: '0 14px 8px' }}>
          <button type="button" className="btn-primary" data-testid="new-agent" onClick={() => setNewOpen(true)}>
            New agent
          </button>
        </div>
        {rows.length === 0 ? (
          <div className="helper">Add someone, then give them work.</div>
        ) : (
          <TeamList
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRename={(id) => {
              setRenameId(id)
              setRenameValue(agents[id]?.agent.name ?? '')
            }}
            onDelete={async (id) => {
              if (confirm('Delete this agent and their files?')) {
                await api({ type: 'agent.delete', agentId: id })
                await refreshList()
                if (selectedId === id) setSelectedId(null)
              }
            }}
          />
        )}
        {teamLoginStrip ? (
          <div className="banner">Sign in to Claude Code or Codex to talk to agents</div>
        ) : null}
        {!connected ? <div className="banner">Lost the background service. Reconnecting…</div> : null}
      </div>

      <div className="col" style={{ display: 'flex', flexDirection: 'column' }}>
        {!selected ? (
          <div className="helper">Add someone, then give them work.</div>
        ) : (
          <>
            <div style={{ padding: '8px 16px 0' }}>
              {selected.banners.map((b) => (
                <div key={b.bannerId} className="banner" data-testid={`banner-${b.type}`}>
                  <div>{b.message || b.type}</div>
                  {b.actions.includes('log-in') ? (
                    <button
                      type="button"
                      className="btn-primary"
                      data-testid="banner-login"
                      onClick={() =>
                        void api({
                          type: 'harness.startLogin',
                          agentId: selected.agent.id,
                          harness: b.harness ?? selected.agent.harness,
                        })
                      }
                    >
                      Log in
                    </button>
                  ) : null}
                  {b.actions.includes('allow-site') ? (
                    <button
                      type="button"
                      className="btn-primary"
                      data-testid="allow-site"
                      onClick={() => {
                        void api({
                          type: 'browser.allowSite',
                          agentId: selected.agent.id,
                          host: b.host ?? '',
                          allow: true,
                        }).then(() => {
                          setAgents((prev) => {
                            const cur = prev[selected.agent.id]
                            if (!cur) return prev
                            return {
                              ...prev,
                              [selected.agent.id]: {
                                ...cur,
                                banners: cur.banners.filter((x) => x.type !== 'needs-site'),
                              },
                            }
                          })
                        })
                      }}
                    >
                      Allow
                    </button>
                  ) : null}
                  {b.actions.includes('deny-site') ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      data-testid="deny-site"
                      onClick={() =>
                        void api({
                          type: 'browser.allowSite',
                          agentId: selected.agent.id,
                          host: b.host ?? '',
                          allow: false,
                        })
                      }
                    >
                      Deny
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {!selected.banners.some((b) => b.type === 'memory-error') &&
            selected.runtime.mcp.find((m) => m.name === 'hindsight')?.last !== 'ok' ? (
              <div className="memory-setup" data-testid="memory-setup">
                <div>Setting up memory…</div>
                <div className="memory-setup-bar" role="progressbar" aria-label="Setting up memory" />
              </div>
            ) : null}
            <PartTimeline
              turns={selected.turns as never}
              streaming={
                selected.runtime.state === 'thinking' || selected.runtime.state === 'needs-you'
              }
              answerChatPartId={
                answerChat && answerChat.agentId === selected.agent.id ? answerChat.partId : null
              }
              onAskAnswer={(partId, answers) => void sendAskAnswer(partId, answers)}
              onAskAnswerInChat={(partId) =>
                setAnswerChat({ agentId: selected.agent.id, partId })
              }
            />
            <HarnessSwitcher
              harness={selected.agent.harness}
              disabled={selected.runtime.state === 'thinking' || selected.runtime.state === 'needs-you'}
              onChange={(h) => void api({ type: 'agent.setHarness', agentId: selected.agent.id, harness: h })}
            />
            <Composer
              agentName={selected.agent.name}
              primary={primary}
              draft={draft}
              onDraftChange={(v) => {
                setDraft(v)
                setPauseHint(null)
              }}
              models={models}
              model={selected.agent.model}
              effort={selected.agent.effort}
              contextUsed={selected.runtime.contextUsed}
              contextWindow={selected.runtime.contextWindow}
              spendUsdToday={selected.runtime.spendUsdToday}
              modelDisabled={selected.runtime.state === 'thinking' || selected.runtime.state === 'needs-you'}
              pickerOpen={pickerOpen}
              onPickerOpenChange={setPickerOpen}
              onSetModel={(model, effort) =>
                void api({ type: 'agent.setModel', agentId: selected.agent.id, model, effort })
              }
              onPrimary={() => void handlePrimary()}
              onSubmitText={(t) => void sendChat(t)}
              onSlash={(c, a) => handleSlash(c, a)}
              slashItems={slashItems}
              pauseHint={pauseHint}
              slashError={slashError}
              onClearSlashError={() => setSlashError(null)}
            />
          </>
        )}
      </div>

      {rightTabs.length > 0 ? (
        <TabStrip
          tabs={rightTabs}
          activeId={activeTabId}
          agentId={selectedId}
          held={Boolean(selected?.runtime.humanControl.held)}
          onSelect={(id) => selectedId && setActiveByAgent((prev) => ({ ...prev, [selectedId]: id }))}
          onClose={(id) => selectedId && closeTab(selectedId, id)}
          onPick={(kind) => {
            if (!selectedId) return
            addTab(selectedId, kind)
          }}
          filesSearchToken={filesSearchToken}
          onUrlChange={(tabId, url) => {
            if (!selectedId) return
            setTabsByAgent((prev) => ({
              ...prev,
              [selectedId]: (prev[selectedId] ?? []).map((x) =>
                x.id === tabId
                  ? {
                      ...x,
                      url,
                      title: url.replace(/^https?:\/\//, '').slice(0, 24) || 'Browser',
                    }
                  : x,
              ),
            }))
          }}
          onTakeControl={() =>
            selectedId && void api({ type: 'browser.setHumanControl', agentId: selectedId, held: true })
          }
          onReturnControl={() =>
            selectedId && void api({ type: 'browser.setHumanControl', agentId: selectedId, held: false })
          }
        />
      ) : selectedId ? (
        <div className="right-pane right-pane-plus-only" data-testid="right-pane-plus-only">
          <div className="tab-strip">
            <PlusMenu
              onPick={(kind) => {
                addTab(selectedId, kind)
              }}
              filesEnabled
            />
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="hint" data-testid="toast">
          {toast}
        </div>
      ) : null}

      <NewAgent open={newOpen} onClose={() => setNewOpen(false)} onCreate={createAgent} />

      {renameId ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Rename">
          <div className="modal">
            <h2 style={{ margin: 0, fontSize: 16 }}>Rename</h2>
            <input
              data-testid="rename-input"
              value={renameValue}
              placeholder={agents[renameId]?.agent.name}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setRenameId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                data-testid="rename-submit"
                onClick={async () => {
                  await api({ type: 'agent.rename', agentId: renameId, name: renameValue.trim() })
                  await refreshList()
                  setRenameId(null)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {waitModal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="An agent is waiting on you"
          data-testid="wait-modal"
        >
          <div className="modal">
            <h2 style={{ margin: 0, fontSize: 16 }}>An agent is waiting on you</h2>
            <p style={{ margin: 0, color: 'var(--muted)' }}>{waitModal.names.join(', ')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-primary"
                data-testid="wait-open"
                onClick={() => {
                  const first = Object.values(agentsRef.current).find((bundle) =>
                    bundle.turns.some((t) =>
                      t.parts.some((p) => p.type === 'ask-user-question' && p.status === 'open'),
                    ),
                  )
                  if (first) setSelectedId(first.agent.id)
                  setWaitModal(null)
                  void window.openbot?.showWindow?.()
                }}
              >
                Open OpenBot
              </button>
              {waitModal.mode === 'pause-all' ? (
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="wait-pause-others"
                  onClick={() => {
                    for (const [id, bundle] of Object.entries(agentsRef.current)) {
                      const waiting = bundle.turns.some((t) =>
                        t.parts.some((p) => p.type === 'ask-user-question' && p.status === 'open'),
                      )
                      if (!waiting) void api({ type: 'agent.pause', agentId: id })
                    }
                    setWaitModal(null)
                  }}
                >
                  Pause the others
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="wait-stop-quit"
                  onClick={() => {
                    for (const [id, bundle] of Object.entries(agentsRef.current)) {
                      const openAsk = bundle.turns.some((t) =>
                        t.parts.some((p) => p.type === 'ask-user-question' && p.status === 'open'),
                      )
                      if (openAsk) void api({ type: 'agent.pause', agentId: id })
                    }
                    quitConfirmed.current = true
                    setWaitModal(null)
                    void window.openbot?.confirmQuit?.()
                  }}
                >
                  Stop and quit
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
