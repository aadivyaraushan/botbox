import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { randomUUID } from './uuid'
import { TeamList } from './team/TeamList'
import { NewAgent } from './team/NewAgent'
import { PartTimeline } from './thread/PartTimeline'
import { Composer } from './thread/Composer'
import { HarnessSwitcher } from './ui/HarnessSwitcher'
import { TabStrip } from './right-pane/TabStrip'

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

type Part = Record<string, unknown> & { type: string; id: string }
type Turn = {
  id: string
  source: string
  role: string
  parts: Part[]
  queued?: boolean
  dropped?: boolean
}

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
  const [rightTabs] = useState<Array<{ id: string; kind: 'browser' | 'terminal' | 'files'; title: string }>>([])
  const streamStarted = useRef(false)
  const lastEnvelopeId = useRef(0)

  const selected = selectedId ? agents[selectedId] : null

  const attentionCount = useMemo(() => {
    let n = 0
    for (const a of Object.values(agents)) {
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
        const event = env.event as Record<string, unknown>
        setAgents((prev) => {
          const cur = prev[agentId]
          if (!cur) return prev
          let turns = [...cur.turns]
          let unread = cur.unread
          const ensure = () => {
            let t = turns.find((x) => x.id === turnId)
            if (!t) {
              t = {
                id: turnId,
                source: String(event.source ?? 'user'),
                role: String(event.role ?? 'assistant'),
                parts: [],
              }
              turns.push(t)
            }
            return t
          }
          if (event.kind === 'turn-created') {
            const t = ensure()
            t.source = String(event.source)
            t.role = String(event.role)
            if (event.source === 'compact' || event.source === 'harness-switch-compact') {
              /* divider via source */
            }
          } else if (event.kind === 'reasoning-text') {
            const t = ensure()
            const partId = String(event.partId)
            let p = t.parts.find((x) => x.id === partId)
            if (!p) {
              p = { type: 'reasoning', id: partId, text: '' }
              t.parts.push(p)
            }
            p.text = String(p.text ?? '') + String(event.delta ?? '')
            if (selectedId !== agentId) unread = true
          } else if (event.kind === 'assistant-text') {
            const t = ensure()
            const partId = String(event.partId)
            let p = t.parts.find((x) => x.id === partId)
            if (!p) {
              p = { type: 'text', id: partId, text: '' }
              t.parts.push(p)
            }
            p.text = String(p.text ?? '') + String(event.delta ?? '')
            if (selectedId !== agentId) unread = true
          } else if (event.kind === 'tool-use') {
            const t = ensure()
            t.parts.push({
              type: 'tool',
              id: String(event.callId),
              name: String(event.name),
              inputSummary: String(event.inputSummary ?? ''),
            })
          } else if (event.kind === 'compacted') {
            const t = ensure()
            t.parts.push({
              type: 'compaction',
              id: String(event.partId),
              reason: String(event.reason),
              forHarness: event.forHarness as string | undefined,
            })
            if (event.reason === 'manual') t.source = 'compact'
          } else if (event.kind === 'peer-message' || (event as { type?: string }).type === 'peer-message') {
            /* harness peer is usually a part via history; live via daemon may differ */
          }
          return { ...prev, [agentId]: { ...cur, turns, unread } }
        })
      }
    },
    [selectedId, upsertRuntime],
  )

  const refreshList = useCallback(async () => {
    const res = await api({ type: 'agent.list' })
    if (!res.ok) return
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
    const offStatus = window.openbot.onStatus((s) => setConnected(s.connected))
    const offMenu = window.openbot.onMenu((a) => {
      if (a.action === 'new-agent') setNewOpen(true)
      if (a.action === 'browser') {
        /* M2: View→Browser present; body stays Coming later */
      }
      if (a.action === 'pause-all') {
        for (const id of Object.keys(agents)) void api({ type: 'agent.pause', agentId: id })
      }
      if (a.action === 'resume-all') {
        for (const id of Object.keys(agents)) void api({ type: 'agent.resume', agentId: id })
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

    return () => {
      offEvent()
      offStatus()
      offMenu()
      offSelect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const a = agents[selectedId]
    if (!a) return
    if (!a.historyLoaded) void loadHistory(selectedId)
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
  }, [selectedId])

  const rows = Object.values(agents).map((a) => ({
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
    const runtime = res.runtime as Runtime
    const banners = (res.banners as Banner[]) ?? []
    setAgents((prev) => ({
      ...prev,
      [agent.id]: {
        agent,
        runtime,
        banners,
        turns: [],
        unread: false,
        historyLoaded: false,
      },
    }))
    setSelectedId(agent.id)
    await refreshList()
    return null
  }

  async function handlePrimary() {
    if (!selected) return
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

  async function sendChat(text: string) {
    if (!selected) return
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

  const primary = selected ? primaryFor(selected.runtime.state) : 'send'
  const teamLoginStrip =
    Object.keys(agents).length === 0 &&
    false /* fake may not expose global auth; M2 first-run strip optional with empty team */

  return (
    <div className="app-shell">
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
                </div>
              ))}
            </div>
            <PartTimeline turns={selected.turns as never} />
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

      <TabStrip tabs={rightTabs} activeId={null} onSelect={() => {}} browserEnabled={false} />

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
    </div>
  )
}
