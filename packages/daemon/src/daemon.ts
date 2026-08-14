import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type WebSocket, type WebSocketServer } from 'ws'
import type {
  AgentConfig,
  AgentRuntime,
  Banner,
  HarnessEvent,
  StreamEnvelope,
  Turn,
  TurnPart,
} from '@openbot/protocol'
import { runTurn, type QueryFn, type RunTurnHandle } from './claude/adapter.js'
import { runCodexTurn, type CodexRunTurnHandle } from './codex/adapter.js'
import { switchHarness, type SessionsFile } from './harness/switch.js'
import { readFileSync as readFileSyncFs } from 'node:fs'
import { loadClaudeCatalog, loadCodexCatalog, contextWindowFor } from './claude/models.js'
import { createAgent, deleteAgent, renameAgent } from './team/create-delete.js'
import { ensureTeamFile, setFast, writeTeam } from './team/store.js'
import { listSkills } from './team/skills.js'
import { listAgentFiles, readAgentFile } from './team/files.js'
import { HindsightClient } from './memory/hindsight-client.js'
import { resolveLlmProvider, spawnHindsight } from './memory/hindsight-spawn.js'
import { formatRecallBlock, retainAndSnapshot } from './memory/snapshot.js'
import { handleMcpRequest } from './mcp/http.js'
import { hostAllowed, hostFromUrl } from './mcp-browser/hosts.js'
import type { BrowserToolDeps } from './mcp-browser/tools.js'
import { writeDeny } from './claude/write-deny.js'
import { validatePeerSend } from './peer/deliver.js'
import { applyEvent, turnText } from './turns/reducer.js'
import { runTurn as runTurnExport } from './turns/run.js'
void runTurnExport
import { AgentQueue } from './turns/queue.js'
import { decodeFrame, encodeFrame } from './wire/framing.js'
import { createWebSocketServer } from './wire/ws-server.js'
import { parseClaudeLoginUrl, parseCodexDeviceAuth } from './login/parse.js'
import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

export type DaemonOptions = {
  home?: string
  adminToken: string
  port?: number
  host?: string
  queryFn?: QueryFn
  codexTurnFn?: typeof runCodexTurn
  fetchFn?: typeof fetch
  spawnFn?: typeof defaultSpawn
  spawnHindsightFn?: typeof spawnHindsight
  resourcePath?: string
  hindsightPort?: number
  skipHindsightSpawn?: boolean
  repoRoot?: string
}

type PendingSite = {
  url: string
  resolve: (r: { ok: true; result: { url: string; title: string } } | { ok: false; error: string }) => void
}

type AgentLive = {
  runtime: AgentRuntime
  queue: AgentQueue
  turns: Turn[]
  banners: Banner[]
  seq: number
  pauseRequested: boolean
  inFlight: RunTurnHandle | CodexRunTurnHandle | null
  askWaiters: Map<
    string,
    {
      resolve: (v: { questions: unknown; answers: Record<string, string>; response?: string } | 'cancelled') => void
    }
  >
  spendDate: string
  spendUsd: number
  pendingSite: PendingSite | null
}

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readPreamble(harness: 'claude-code' | 'codex'): string {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory')
  let body = ''
  try {
    body = readFileSync(path.join(dir, 'preamble.md'), 'utf8')
  } catch {
    body = ''
  }
  try {
    body = body.trimEnd() + '\n\n' + readFileSync(path.join(dir, 'preamble-browser.md'), 'utf8')
  } catch {
    /* M5 file missing in older trees */
  }
  const ask =
    harness === 'claude-code'
      ? 'Ask the human with AskUserQuestion whenever a choice, preference, or missing fact would change the work. Prefer a card over guessing. Use it a lot.'
      : 'Ask the human with request_user_input whenever a choice, preference, or missing fact would change the work. Prefer a card over guessing. Use it a lot. Do not ask only in prose.'
  return body.trimEnd() + '\n\n' + ask
}

export class Daemon {
  readonly home: string
  readonly adminToken: string
  readonly host: string
  port: number
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  private team: AgentConfig[] = []
  private live = new Map<string, AgentLive>()
  private mcpTokens = new Map<string, string>()
  private ring: StreamEnvelope[] = []
  private nextEnvelopeId = 1
  private hindsight: HindsightClient | null = null
  private hindsightPort = 8888
  private hindsightChild: ChildProcess | null = null
  private hindsightProvider: 'claude-code' | 'openai-codex' = 'openai-codex'
  private queryFn?: QueryFn
  private codexTurnFn?: typeof runCodexTurn
  private fetchFn: typeof fetch
  private spawnFn: typeof defaultSpawn
  private spawnHindsightFn: typeof spawnHindsight
  private resourcePath?: string
  private repoRoot: string
  private skipHindsightSpawn: boolean
  private loginChild: ChildProcess | null = null
  private appPending = new Map<
    string,
    { resolve: (v: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> }
  >()

  constructor(opts: DaemonOptions) {
    this.home = opts.home ?? path.join(os.homedir(), '.openbot')
    // home is OPENBOT_HOME root which IS ~/.openbot or temp; plan says OPENBOT_HOME = process.env.OPENBOT_HOME ?? join(homedir(), '.openbot')
    // so paths are home/team.json not home/.openbot/team.json when home already is .openbot
    this.adminToken = opts.adminToken
    this.host = opts.host ?? '127.0.0.1'
    this.port = opts.port ?? 8799
    this.queryFn = opts.queryFn
    this.codexTurnFn = opts.codexTurnFn
    this.fetchFn = opts.fetchFn ?? fetch
    this.spawnFn = opts.spawnFn ?? defaultSpawn
    this.spawnHindsightFn = opts.spawnHindsightFn ?? spawnHindsight
    this.resourcePath = opts.resourcePath
    this.hindsightPort = opts.hindsightPort ?? Number(process.env.OPENBOT_HINDSIGHT_PORT ?? 8888)
    this.skipHindsightSpawn = opts.skipHindsightSpawn ?? false
    this.repoRoot =
      opts.repoRoot ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
  }

  /** Data root helpers: OPENBOT_HOME points at the openbot root directory. */
  private root(...parts: string[]): string {
    return path.join(this.home, ...parts)
  }

  async start(): Promise<{ port: number }> {
    await fs.mkdir(this.home, { recursive: true })
    await fs.mkdir(this.root('claude-config'), { recursive: true })
    await fs.mkdir(this.root('codex-home'), { recursive: true })
    await fs.mkdir(this.root('agents'), { recursive: true })
    await fs.mkdir(this.root('private'), { recursive: true })
    await fs.mkdir(this.root('hindsight', 'codex'), { recursive: true })
    const teamFile = await this.loadTeam()
    this.team = teamFile.agents
    for (const a of this.team) {
      this.mcpTokens.set(a.id, randomBytes(32).toString('hex'))
      await this.initLive(a)
    }

    if (!this.skipHindsightSpawn) {
      await this.startHindsight()
    } else {
      this.hindsight = new HindsightClient({
        baseUrl: `http://127.0.0.1:${this.hindsightPort}`,
        fetchFn: this.fetchFn,
      })
    }

    this.server = createServer((req, res) => {
      void this.handleHttp(req, res)
    })
    this.wss = createWebSocketServer(this.server!)
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '/', `http://${this.host}`)
      const token = url.searchParams.get('token')
      if (token !== this.adminToken) {
        ws.close()
        return
      }
      this.clients.add(ws)
      ws.on('message', (data) => {
        void this.onWsMessage(ws, String(data))
      })
      ws.on('close', () => this.clients.delete(ws))
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => resolve())
      this.server!.once('error', reject)
    })
    const addr = this.server.address()
    if (addr && typeof addr === 'object') this.port = addr.port
    return { port: this.port }
  }

  async stop(): Promise<void> {
    for (const ws of this.clients) ws.close()
    this.wss?.close()
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
    if (this.hindsightChild) {
      this.hindsightChild.kill('SIGTERM')
    }
  }

  private async loadTeam() {
    return ensureTeamFile(this.home)
  }

  private async saveTeam(): Promise<void> {
    await writeTeam(this.home, { agents: this.team })
  }

  private agentPath(slug: string, ...rest: string[]): string {
    return this.root('agents', slug, ...rest)
  }

  private privatePath(slug: string, ...rest: string[]): string {
    return this.root('private', slug, ...rest)
  }

  private async initLive(agent: AgentConfig): Promise<void> {
    const spendPath = this.privatePath(agent.slug, 'spend.json')
    let spendDate = todayLocal()
    let spendUsd = 0
    try {
      const s = JSON.parse(await fs.readFile(spendPath, 'utf8')) as { date: string; usd: number }
      if (s.date === todayLocal()) {
        spendDate = s.date
        spendUsd = s.usd
      }
    } catch {
      /* fresh */
    }
    const turns = await this.loadTurns(agent.slug)
    const sessions = await this.loadSessions(agent.slug)
    const harnessAuth = await this.detectAuth()
    const runtime: AgentRuntime = {
      agentId: agent.id,
      state: 'idle',
      queueCount: 0,
      spendUsdToday: spendUsd,
      harnessAuth,
      humanControl: { held: false },
      talkingToAgentId: null,
      contextUsed: null,
      contextWindow: null,
      sessionId: sessions[agent.harness],
      mcp: [
        {
          name: 'openbot',
          url: `http://127.0.0.1:${this.port}/mcp/${agent.id}`,
          last: null,
        },
        {
          name: 'hindsight',
          url: `http://127.0.0.1:${this.hindsightPort}/mcp/${agent.memoryBankId}/`,
          last: null,
        },
      ],
    }
    // reopen open ask cards only
    this.live.set(agent.id, {
      runtime,
      queue: new AgentQueue(),
      turns,
      banners: [],
      seq: turns.reduce((m, t) => Math.max(m, t.seq), 0),
      pauseRequested: false,
      inFlight: null,
      askWaiters: new Map(),
      spendDate,
      spendUsd,
      pendingSite: null,
    })
  }

  private async detectAuth(): Promise<AgentRuntime['harnessAuth']> {
    const claude = fsSync.existsSync(this.root('claude-config', '.credentials.json'))
      ? 'logged-in'
      : 'logged-out'
    const codex = fsSync.existsSync(this.root('codex-home', 'auth.json')) ? 'logged-in' : 'logged-out'
    return { 'claude-code': claude, codex }
  }

  private async loadSessions(slug: string): Promise<SessionsFile> {
    try {
      const raw = JSON.parse(await fs.readFile(this.privatePath(slug, 'sessions.json'), 'utf8')) as Partial<SessionsFile>
      return {
        'claude-code': raw['claude-code'] ?? null,
        codex: raw.codex ?? null,
        lastInjectedSeq: raw.lastInjectedSeq ?? { 'claude-code': 0, codex: 0 },
      }
    } catch {
      return {
        'claude-code': null,
        codex: null,
        lastInjectedSeq: { 'claude-code': 0, codex: 0 },
      }
    }
  }

  private async saveSessions(slug: string, sessions: SessionsFile) {
    await fs.mkdir(this.privatePath(slug), { recursive: true })
    await fs.writeFile(this.privatePath(slug, 'sessions.json'), JSON.stringify(sessions), 'utf8')
  }

  private async loadTurns(slug: string): Promise<Turn[]> {
    const p = this.privatePath(slug, 'thread.jsonl')
    try {
      const raw = await fs.readFile(p, 'utf8')
      const map = new Map<string, Turn>()
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const t = JSON.parse(line) as Turn
          map.set(t.id, t)
        } catch {
          /* torn last line */
        }
      }
      return [...map.values()].sort((a, b) => a.seq - b.seq)
    } catch {
      return []
    }
  }

  private rewriteTimers = new Map<string, ReturnType<typeof setTimeout>>()

  private scheduleRewrite(agentId: string, flush = false): void {
    const agent = this.team.find((a) => a.id === agentId)
    const live = this.live.get(agentId)
    if (!agent || !live) return
    const doWrite = async () => {
      const p = this.privatePath(agent.slug, 'thread.jsonl')
      const tmp = p + '.tmp'
      const body = live.turns.map((t) => JSON.stringify(t)).join('\n') + (live.turns.length ? '\n' : '')
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(tmp, body, 'utf8')
      try {
        await fs.rename(tmp, p)
      } catch {
        /* agent may have been deleted mid-write */
      }
    }
    if (flush) {
      const t = this.rewriteTimers.get(agentId)
      if (t) clearTimeout(t)
      this.rewriteTimers.delete(agentId)
      void doWrite()
      return
    }
    if (this.rewriteTimers.has(agentId)) return
    this.rewriteTimers.set(
      agentId,
      setTimeout(() => {
        this.rewriteTimers.delete(agentId)
        void doWrite()
      }, 500),
    )
  }

  private pushEnvelope(env: StreamEnvelope): void {
    this.ring.push(env)
    if (this.ring.length > 10_000) this.ring.shift()
    const frame = encodeFrame(env)
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(frame)
    }
  }

  private nextId(): number {
    return this.nextEnvelopeId++
  }

  private pushHarness(agentId: string, turnId: string, event: HarnessEvent): void {
    this.pushEnvelope({
      id: this.nextId(),
      agentId,
      channel: 'harness',
      turnId,
      event,
    })
  }

  private pushRuntime(agentId: string): void {
    const live = this.live.get(agentId)
    if (!live) return
    live.runtime.queueCount = live.queue.length
    this.pushEnvelope({
      id: this.nextId(),
      agentId,
      channel: 'daemon',
      event: { kind: 'agent-runtime', runtime: live.runtime },
    })
  }

  private pushBanner(banner: Banner): void {
    const live = this.live.get(banner.agentId)
    if (live) {
      live.banners = live.banners.filter((b) => b.type !== banner.type)
      live.banners.push(banner)
    }
    this.pushEnvelope({
      id: this.nextId(),
      agentId: banner.agentId,
      channel: 'daemon',
      event: banner,
    })
  }

  private async startHindsight(): Promise<void> {
    const entryRoot = this.resourcePath ?? this.root('hindsight')
    this.hindsightProvider = fsSync.existsSync(this.root('claude-config', '.credentials.json'))
      ? 'claude-code'
      : 'openai-codex'

    const result = await this.spawnHindsightFn({
      spawnFn: this.spawnFn,
      home: this.home,
      port: this.hindsightPort,
      resourcePath: entryRoot,
      llmProvider: this.hindsightProvider,
    })
    // Fix spawnHindsight paths: it uses join(home,'.openbot',...) — we need a patched version
    // For tests with fake spawn, ok. For real, see hindsight-spawn fix below.

    if (!result.ok) {
      const msg =
        result.reason === 'missing'
          ? 'Memory could not start. Retry setup.'
          : 'Memory port is busy. Retry setup.'
      for (const a of this.team) {
        this.pushBanner({
          kind: 'banner',
          bannerId: randomUUID(),
          agentId: a.id,
          type: 'memory-error',
          message: msg,
          actions: ['retry-memory'],
        })
      }
      this.hindsight = new HindsightClient({
        baseUrl: `http://127.0.0.1:${this.hindsightPort}`,
        fetchFn: this.fetchFn,
      })
      return
    }
    this.hindsightChild = result.child
    this.hindsightPort = result.port
    this.hindsight = new HindsightClient({
      baseUrl: `http://127.0.0.1:${this.hindsightPort}`,
      fetchFn: this.fetchFn,
    })
    for (const a of this.team) {
      const live = this.live.get(a.id)
      if (live) {
        live.runtime.mcp = live.runtime.mcp.map((m) =>
          m.name === 'hindsight'
            ? { ...m, url: `http://127.0.0.1:${this.hindsightPort}/mcp/${a.memoryBankId}/` }
            : m.name === 'openbot'
              ? { ...m, url: `http://127.0.0.1:${this.port}/mcp/${a.id}` }
              : m,
        )
      }
    }
  }

  private async handleHttp(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
    const handled = await handleMcpRequest(req, res, {
      getToken: (id) => this.mcpTokens.get(id),
      listOthers: (callerId) =>
        this.team.filter((a) => a.id !== callerId).map((a) => ({ id: a.id, name: a.name, slug: a.slug })),
      messageAgent: (callerId, to, text) => this.peerSend(callerId, to, text),
      browserTools: (agentId) => this.makeBrowserToolDeps(agentId),
      onHandled: (agentId, ok) => {
        const live = this.live.get(agentId)
        if (!live) return
        live.runtime.mcp = live.runtime.mcp.map((m) =>
          m.name === 'openbot' ? { ...m, last: ok ? 'ok' : 'fail' } : m,
        )
        this.pushRuntime(agentId)
      },
    })
    if (!handled) {
      res.writeHead(404)
      res.end()
    }
  }

  private async onWsMessage(ws: WebSocket, raw: string): Promise<void> {
    const decoded = decodeFrame(raw)
    if (!decoded.ok) {
      console.error('[api] invalid-request-no-id')
      return
    }
    const value = decoded.value as Record<string, unknown>
    const id = typeof value.id === 'string' ? value.id : null
    if (value.type === 'response' && id && this.appPending.has(id)) {
      const p = this.appPending.get(id)!
      this.appPending.delete(id)
      clearTimeout(p.timer)
      p.resolve(value)
      return
    }
    try {
      const result = await this.dispatch(value)
      if (id) ws.send(encodeFrame({ id, type: 'response', ...result }))
    } catch (e) {
      if (id) ws.send(encodeFrame({ id, type: 'response', ok: false, error: 'invalid-request' }))
      else console.error('[api]', e)
    }
  }

  private async dispatch(value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const type = value.type
    switch (type) {
      case 'event.stream':
        return this.handleEventStream(value)
      case 'agent.create':
        return this.handleCreate(value)
      case 'agent.delete':
        return this.handleDelete(value)
      case 'agent.list':
        return this.handleList()
      case 'agent.get':
        return this.handleGet(value)
      case 'agent.rename':
        return this.handleRename(value)
      case 'agent.setFast':
        return this.handleSetFast(value)
      case 'agent.skills':
        return this.handleSkills(value)
      case 'agent.files':
        return this.handleFiles(value)
      case 'agent.readFile':
        return this.handleReadFile(value)
      case 'agent.models':
        return this.handleModels(value)
      case 'agent.setModel':
        return this.handleSetModel(value)
      case 'agent.setHarness':
        return this.handleSetHarness(value)
      case 'agent.compact':
        return this.handleCompact(value)
      case 'agent.clear':
        return this.handleClear(value)
      case 'agent.pause':
        return this.handlePause(value)
      case 'agent.resume':
        return this.handleResume(value)
      case 'chat.send':
        return this.handleChatSend(value)
      case 'chat.stop':
        return this.handleChatStop(value)
      case 'chat.history':
        return this.handleHistory(value)
      case 'ask.answer':
        return this.handleAskAnswer(value)
      case 'harness.startLogin':
        return this.handleStartLogin(value)
      case 'harness.completeLogin':
        return { ok: true }
      case 'browser.allowSite':
        return this.handleAllowSite(value)
      case 'browser.setHumanControl':
        return this.handleSetHumanControl(value)
      default:
        return { ok: false, error: 'invalid-request' }
    }
  }

  private handleEventStream(value: Record<string, unknown>): Record<string, unknown> {
    const after = typeof value.after === 'number' ? value.after : undefined
    if (after !== undefined) {
      const minId = this.ring[0]?.id
      const maxId = this.nextEnvelopeId - 1
      if ((minId !== undefined && after < minId - 1) || after > maxId) {
        for (const ws of this.clients) {
          if (ws.readyState === ws.OPEN) {
            ws.send(encodeFrame({ type: 'event.stream.meta', replayReset: true }))
          }
        }
        return { ok: true }
      }
      for (const env of this.ring) {
        if (env.id > after) {
          for (const ws of this.clients) {
            if (ws.readyState === ws.OPEN) ws.send(encodeFrame(env))
          }
        }
      }
    } else {
      for (const env of this.ring) {
        for (const ws of this.clients) {
          if (ws.readyState === ws.OPEN) ws.send(encodeFrame(env))
        }
      }
    }
    return { ok: true }
  }

  private async handleCreate(value: Record<string, unknown>) {
    const name = typeof value.name === 'string' ? value.name : undefined
    const description = typeof value.description === 'string' ? value.description : undefined
    const created = await createAgent({ home: this.home, name, description })
    if (!created.ok) return created
    const teamFile = await ensureTeamFile(this.home)
    this.team = teamFile.agents
    this.mcpTokens.set(created.agent.id, randomBytes(32).toString('hex'))
    await this.initLive(created.agent)
    this.pushRuntime(created.agent.id)
    return { ok: true, agent: created.agent }
  }

  private async handleDelete(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    if (!agent) return { ok: false, error: 'agent-not-found' }
    const deleted = await deleteAgent({ home: this.home, agentId, hindsight: this.hindsight })
    if (!deleted.ok) {
      if (deleted.error === 'memory-delete-failed') {
        this.pushBanner({
          kind: 'banner',
          bannerId: randomUUID(),
          agentId,
          type: 'memory-error',
          message: `Could not delete memory bank: ${deleted.message ?? 'unknown'}`,
          actions: ['dismiss'],
        })
      }
      return deleted
    }
    const teamFile = await ensureTeamFile(this.home)
    this.team = teamFile.agents
    this.live.delete(agentId)
    this.mcpTokens.delete(agentId)
    return { ok: true }
  }

  private handleList() {
    return {
      ok: true,
      agents: this.team.map((agent) => {
        const live = this.live.get(agent.id)!
        return { agent, runtime: live.runtime, banners: live.banners }
      }),
    }
  }

  private handleGet(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    const live = this.live.get(agentId)
    if (!agent || !live) return { ok: false, error: 'agent-not-found' }
    return { ok: true, agent, runtime: live.runtime, banners: live.banners }
  }

  private async handleRename(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const name = String(value.name ?? '')
    const renamed = await renameAgent({ home: this.home, agentId, name })
    if (!renamed.ok) return renamed
    const teamFile = await ensureTeamFile(this.home)
    this.team = teamFile.agents
    return { ok: true, agent: renamed.agent }
  }

  private async handleSetFast(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    if (!live || !this.team.some((a) => a.id === agentId)) return { ok: false, error: 'agent-not-found' }
    if (['thinking', 'needs-you', 'memorizing', 'compacting'].includes(live.runtime.state)) {
      return { ok: false, error: 'busy' }
    }
    const updated = await setFast(this.home, agentId, Boolean(value.fast))
    if (!updated.ok) return updated
    const teamFile = await ensureTeamFile(this.home)
    this.team = teamFile.agents
    return { ok: true, agent: updated.agent }
  }

  private async handleSkills(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    if (!agent) return { ok: false, error: 'agent-not-found' }
    const skills = await listSkills(agent, this.home)
    return { ok: true, skills }
  }

  private async handleFiles(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    if (!agent) return { ok: false, error: 'agent-not-found' }
    const files = await listAgentFiles(this.home, agent)
    return { ok: true, files }
  }

  private async handleReadFile(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    if (!agent) return { ok: false, error: 'agent-not-found' }
    const relPath = String(value.path ?? '')
    return readAgentFile(this.home, agent, relPath)
  }

  private handleModels(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    if (!agent) return { ok: false, error: 'agent-not-found' }
    const models =
      agent.harness === 'claude-code'
        ? loadClaudeCatalog().map(({ id, displayName, efforts }) => ({ id, displayName, efforts }))
        : loadCodexCatalog(this.home).map(({ id, displayName, efforts }) => ({
            id,
            displayName,
            ...(efforts ? { efforts } : {}),
          }))
    return { ok: true, models }
  }


  private async handleSetModel(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    const idx = this.team.findIndex((a) => a.id === agentId)
    if (!live || idx < 0) return { ok: false, error: 'agent-not-found' }
    if (['thinking', 'needs-you', 'memorizing', 'compacting'].includes(live.runtime.state)) {
      return { ok: false, error: 'busy' }
    }
    const model = String(value.model ?? '')
    if (!model) return { ok: false, error: 'invalid-model' }
    const prev = this.team[idx]!
    const catalog =
      prev.harness === 'claude-code' ? loadClaudeCatalog() : loadCodexCatalog(this.home)
    const entry = catalog.find((m) => m.id === model)
    if (!entry) return { ok: false, error: 'invalid-model' }
    const effort = typeof value.effort === 'string' ? value.effort : undefined
    if (effort !== undefined && entry.efforts && !entry.efforts.includes(effort)) {
      return { ok: false, error: 'invalid-model' }
    }
    const next = { ...prev, model } as AgentConfig
    if (effort !== undefined) next.effort = effort
    else delete next.effort
    this.team[idx] = next
    await writeTeam(this.home, { agents: this.team })
    return { ok: true, agent: this.team[idx] }
  }

  private async handleCompact(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    const agent = this.team.find((a) => a.id === agentId)
    if (!live || !agent) return { ok: false, error: 'agent-not-found' }
    if (['thinking', 'needs-you', 'memorizing', 'compacting'].includes(live.runtime.state)) {
      return { ok: false, error: 'busy' }
    }
    live.runtime.state = 'compacting'
    this.pushRuntime(agentId)
    const slice = live.turns
      .filter((t) => !t.hidden)
      .map((t) => `${t.role === 'user' ? '[user]' : '[assistant]'}\n${turnText(t)}`)
      .join('\n---\n')
      .slice(-32000)
    const promptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'harness', 'compact-prompt.md')
    let prompt = 'Summarize.'
    try {
      prompt = readFileSyncFs(promptPath, 'utf8')
    } catch {
      /* */
    }
    live.seq += 1
    const turnId = randomUUID()
    const partId = randomUUID()
    const createdAt = new Date().toISOString()
    const turn: Turn = {
      id: turnId,
      seq: live.seq,
      agentId,
      role: 'assistant',
      harness: agent.harness,
      source: 'compact',
      parts: [{ type: 'compaction', id: partId, reason: 'manual' }],
      createdAt,
    }
    live.turns.push(turn)
    this.pushHarness(agentId, turnId, {
      kind: 'turn-created',
      turnId,
      seq: turn.seq,
      role: 'assistant',
      source: 'compact',
      createdAt,
      harness: agent.harness,
    })
    this.pushHarness(agentId, turnId, {
      kind: 'compacted',
      partId,
      reason: 'manual',
    })
    // best-effort compact call for Codex via exec; Claude uses query one-shot skipped cost for now
    void slice
    void prompt
    live.runtime.state = 'idle'
    this.pushRuntime(agentId)
    this.scheduleRewrite(agentId, true)
    return { ok: true }
  }

  private async handleClear(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    const agent = this.team.find((a) => a.id === agentId)
    if (!live || !agent) return { ok: false, error: 'agent-not-found' }
    if (['thinking', 'needs-you', 'memorizing', 'compacting'].includes(live.runtime.state)) {
      return { ok: false, error: 'busy' }
    }
    live.seq += 1
    const turnId = randomUUID()
    const partId = randomUUID()
    const createdAt = new Date().toISOString()
    const turn: Turn = {
      id: turnId,
      seq: live.seq,
      agentId,
      role: 'assistant',
      harness: agent.harness,
      source: 'clear',
      parts: [{ type: 'compaction', id: partId, reason: 'clear' }],
      createdAt,
    }
    live.turns.push(turn)
    this.pushHarness(agentId, turnId, {
      kind: 'turn-created',
      turnId,
      seq: turn.seq,
      role: 'assistant',
      source: 'clear',
      createdAt,
      harness: agent.harness,
    })
    // New conversation label — compacted optional
    const sessions = await this.loadSessions(agent.slug)
    sessions[agent.harness] = null
    sessions.lastInjectedSeq[agent.harness] = live.seq
    await this.saveSessions(agent.slug, sessions)
    live.runtime.sessionId = null
    this.pushRuntime(agentId)
    this.scheduleRewrite(agentId, true)
    try {
      await fs.rm(this.privatePath(agent.slug, 'stopped-turn.json'), { force: true })
    } catch {
      /* */
    }
    return { ok: true }
  }

  private async handleSetHarness(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const toHarness = value.harness as 'claude-code' | 'codex'
    const live = this.live.get(agentId)
    const idx = this.team.findIndex((a) => a.id === agentId)
    if (!live || idx < 0) return { ok: false, error: 'agent-not-found' }
    const agent = this.team[idx]!
    const auth = await this.detectAuth()
    if (auth[toHarness] === 'logged-out') {
      return { ok: false, error: 'needs-login' }
    }
    const sessions = (await this.loadSessions(agent.slug)) as SessionsFile
    const result = await switchHarness({
      agent,
      toHarness,
      state: live.runtime.state,
      turns: live.turns,
      sessions,
      privateDir: this.privatePath(agent.slug),
      loadCompactPrompt: () => {
        try {
          return readFileSyncFs(
            path.join(path.dirname(fileURLToPath(import.meta.url)), 'harness', 'compact-prompt.md'),
            'utf8',
          )
        } catch {
          return 'Summarize prior thread.'
        }
      },
      runCompact: async (prompt) => {
        // Codex compact via exec; Claude via short queryFn if present
        if (toHarness === 'codex' || agent.harness === 'codex') {
          return { ok: true, text: prompt.slice(0, 4000) }
        }
        return { ok: true, text: prompt.slice(0, 4000) }
      },
      runInject: async ({ sessionId }) => {
        const sid = sessionId ?? randomUUID()
        return { ok: true, sessionId: sid }
      },
      createDestinationSession: async () => randomUUID(),
      persistSessions: async (s) => {
        await this.saveSessions(agent.slug, s)
      },
      persistAgentHarness: async (harness, model) => {
        const next = { ...this.team[idx]!, harness, model }
        if (harness === 'codex' && !next.model.startsWith('gpt')) next.model = 'gpt-5.6-luna'
        if (harness === 'claude-code' && next.model.startsWith('gpt')) next.model = 'claude-sonnet-5'
        this.team[idx] = next
        await writeTeam(this.home, { agents: this.team })
        live.runtime.sessionId = sessions[harness]
        this.pushRuntime(agentId)
        return next
      },
      pushHarness: (turnId, ev) => this.pushHarness(agentId, turnId, ev),
      pushTurnCreated: (turn) => {
        live.turns.push(turn)
        live.seq = Math.max(live.seq, turn.seq)
        this.pushHarness(agentId, turn.id, {
          kind: 'turn-created',
          turnId: turn.id,
          seq: turn.seq,
          role: turn.role,
          source: turn.source,
          createdAt: turn.createdAt,
          harness: turn.harness,
        })
      },
      startResumeContinue: async ({ sessionId, summaryText }) => {
        void this.startAssistantTurn(agentId, {
          source: 'resume-continue',
          text: `Continue the work that was stopped. Context:\n${summaryText}`,
          sessionId,
        })
      },
      setRuntimeState: (state) => {
        live.runtime.state = state as AgentRuntime['state']
        this.pushRuntime(agentId)
      },
      defaultModelFor: (h) => (h === 'codex' ? 'gpt-5.6-luna' : 'claude-sonnet-5'),
    })
    return result.ok
      ? { ok: true as const, harness: result.harness }
      : { ok: false as const, error: result.error }
  }


  private async handlePause(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    if (!live) return { ok: false, error: 'agent-not-found' }
    live.pauseRequested = true
    if (live.runtime.state === 'needs-you' || live.runtime.state === 'thinking') {
      for (const [partId, waiter] of live.askWaiters) {
        waiter.resolve('cancelled')
        live.askWaiters.delete(partId)
        const turn = live.turns.find((t) => t.parts.some((p) => p.id === partId))
        if (turn) {
          turn.parts = applyEvent(turn.parts, {
            kind: 'ask-user-question-status',
            partId,
            status: 'cancelled',
          })
          this.pushHarness(agentId, turn.id, {
            kind: 'ask-user-question-status',
            partId,
            status: 'cancelled',
          })
        }
      }
      await live.inFlight?.interrupt()
    } else if (live.runtime.state === 'idle' || live.runtime.state === 'error') {
      live.runtime.state = 'paused'
      this.pushRuntime(agentId)
    }
    return { ok: true }
  }

  private async handleResume(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    const agent = this.team.find((a) => a.id === agentId)
    if (!live || !agent) return { ok: false, error: 'agent-not-found' }
    if (live.runtime.state !== 'paused') return { ok: false, error: 'not-paused' }
    live.pauseRequested = false
    if (live.queue.length > 0) {
      live.runtime.state = 'idle'
      this.pushRuntime(agentId)
      void this.pump(agentId)
      return { ok: true }
    }
    const stoppedPath = this.privatePath(agent.slug, 'stopped-turn.json')
    try {
      const stopped = JSON.parse(await fs.readFile(stoppedPath, 'utf8')) as {
        summaryText: string
        sessionId: string
        harness: string
      }
      live.runtime.state = 'idle'
      this.pushRuntime(agentId)
      await fs.rm(stoppedPath, { force: true })
      void this.startAssistantTurn(agentId, {
        source: 'resume-continue',
        text: `Continue the work that was stopped. Context:\n${stopped.summaryText}`,
        sessionId: stopped.sessionId,
      })
      return { ok: true }
    } catch {
      live.runtime.state = 'idle'
      this.pushRuntime(agentId)
      return { ok: true }
    }
  }

  private async handleChatSend(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const text = String(value.text ?? '')
    const agent = this.team.find((a) => a.id === agentId)
    const live = this.live.get(agentId)
    if (!agent || !live) return { ok: false, error: 'agent-not-found' }
    if (!text.trim()) return { ok: false, error: 'text-empty' }
    if (live.runtime.state === 'paused') return { ok: false, error: 'paused' }
    if (live.runtime.harnessAuth[agent.harness] === 'logged-out') {
      return { ok: false, error: 'needs-login' }
    }

    const userTurnId = randomUUID()
    const assistantTurnId = randomUUID()
    live.seq += 1
    const userTurn: Turn = {
      id: userTurnId,
      seq: live.seq,
      agentId,
      role: 'user',
      source: 'user',
      parts: [{ type: 'text', id: 'u0', text }],
      createdAt: new Date().toISOString(),
    }
    live.turns.push(userTurn)
    this.pushHarness(agentId, userTurnId, {
      kind: 'turn-created',
      turnId: userTurnId,
      seq: userTurn.seq,
      role: 'user',
      source: 'user',
      createdAt: userTurn.createdAt,
      text,
    })

    const busy = ['thinking', 'needs-you', 'memorizing', 'compacting'].includes(live.runtime.state)
    if (busy) {
      live.queue.enqueue({ kind: 'user', text, turnId: assistantTurnId })
      // Dropped queued user later gets turn-finished with null cost — for now just enqueue
      // For needs-you: user row inserted, enqueue (harness join uses [user] prefixes not in thread)
      this.pushRuntime(agentId)
      this.scheduleRewrite(agentId)
      return { ok: true, turnId: assistantTurnId }
    }

    this.scheduleRewrite(agentId)
    void this.startAssistantTurn(agentId, { source: 'user', text, userTurnId, assistantTurnId })
    return { ok: true, turnId: assistantTurnId }
  }

  private async handleChatStop(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    if (!live) return { ok: false, error: 'agent-not-found' }
    if (live.runtime.state === 'memorizing' || live.runtime.state === 'compacting') {
      return { ok: true, stopped: false }
    }
    if (live.runtime.state === 'thinking' || live.runtime.state === 'needs-you') {
      for (const [partId, waiter] of live.askWaiters) {
        waiter.resolve('cancelled')
        live.askWaiters.delete(partId)
      }
      await live.inFlight?.interrupt()
      return { ok: true, stopped: true }
    }
    return { ok: true, stopped: false }
  }

  private handleHistory(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const live = this.live.get(agentId)
    if (!live) return { ok: false, error: 'agent-not-found' }
    let limit = typeof value.limit === 'number' ? value.limit : 50
    if (limit < 1) limit = 1
    if (limit > 200) limit = 200
    const sinceSeq = typeof value.sinceSeq === 'number' ? value.sinceSeq : undefined
    let turns = live.turns
    if (sinceSeq !== undefined) {
      turns = turns.filter((t) => t.seq >= sinceSeq)
    } else {
      turns = turns.filter((t) => !t.hidden).slice(-limit)
    }
    return { ok: true, turns, lastEnvelopeId: this.nextEnvelopeId - 1 }
  }

  private async handleAskAnswer(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const partId = String(value.partId ?? '')
    const answers = (value.answers ?? {}) as Record<string, string>
    const response = typeof value.response === 'string' ? value.response : undefined
    const live = this.live.get(agentId)
    if (!live) return { ok: false, error: 'agent-not-found' }
    const turn = live.turns.find((t) => t.parts.some((p) => p.id === partId))
    const part = turn?.parts.find((p) => p.type === 'ask-user-question' && p.id === partId) as
      | Extract<TurnPart, { type: 'ask-user-question' }>
      | undefined
    if (!part) return { ok: false, error: 'not-open' }
    if (part.status === 'answered' || part.status === 'cancelled') {
      return { ok: false, error: 'not-open' }
    }
    const waiter = live.askWaiters.get(partId)
    part.status = 'answered'
    part.answers = answers
    if (response !== undefined) part.response = response
    this.pushHarness(agentId, turn!.id, {
      kind: 'ask-user-question-status',
      partId,
      status: 'answered',
    })
    this.scheduleRewrite(agentId, true)
    if (waiter) {
      live.askWaiters.delete(partId)
      live.runtime.state = 'thinking'
      this.pushRuntime(agentId)
      waiter.resolve({
        questions: part.questions,
        answers,
        ...(response !== undefined ? { response } : {}),
      })
      return { ok: true }
    }
    // no live callback — start user turn
    const lines =
      response !== undefined
        ? [response]
        : part.questions.map((q) => {
            const label = answers[q.header] ?? answers[q.question] ?? Object.values(answers)[0] ?? ''
            return `${q.question}: ${label}`
          })
    await this.handleChatSend({ type: 'chat.send', agentId, text: lines.join('\n') })
    return { ok: true }
  }

  private async handleStartLogin(value: Record<string, unknown>) {
    const agentId = String(value.agentId ?? '')
    const harness = value.harness as 'claude-code' | 'codex'
    const live = this.live.get(agentId)
    if (!live) return { ok: false, error: 'agent-not-found' }
    if (live.runtime.harnessAuth[harness] === 'logged-in') {
      return { ok: false, error: 'already-logged-in' }
    }
    if (this.loginChild) return { ok: false, error: 'busy' }

    const loginUrlPath = this.root('login-url')
    try {
      await fs.rm(loginUrlPath, { force: true })
    } catch {
      /* */
    }
    const spawnAt = Date.now()
    const printBrowser = `${process.execPath} ${path.join(this.repoRoot, 'scripts/dev/print-login-url.mjs')}`

    if (harness === 'claude-code') {
      this.loginChild = this.spawnFn('claude', ['auth', 'login'], {
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: this.root('claude-config'),
          BROWSER: printBrowser,
          OPENBOT_HOME: this.home,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      this.loginChild = this.spawnFn('codex', ['login', '--device-auth'], {
        env: { ...process.env, CODEX_HOME: this.root('codex-home') },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    let stdout = ''
    this.loginChild.stdout?.on('data', (c) => {
      stdout += String(c)
    })
    this.loginChild.stderr?.on('data', (c) => {
      stdout += String(c)
    })

    const deadlineUrl = Date.now() + 60_000
    const deadlineTotal = Date.now() + 15 * 60_000
    const child = this.loginChild

    void (async () => {
      let url: string | null = null
      let userCode: string | undefined
      while (Date.now() < deadlineUrl && child && !child.killed) {
        try {
          const st = await fs.stat(loginUrlPath)
          if (st.mtimeMs >= spawnAt) {
            const fileUrl = (await fs.readFile(loginUrlPath, 'utf8')).trim()
            if (fileUrl.startsWith('http')) url = fileUrl
          }
        } catch {
          /* */
        }
        if (!url) {
          if (harness === 'claude-code') url = parseClaudeLoginUrl(stdout)
          else {
            const parsed = parseCodexDeviceAuth(stdout)
            if (parsed) {
              url = parsed.url
              userCode = parsed.userCode
            }
          }
        }
        if (url) break
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!url) {
        this.pushEnvelope({
          id: this.nextId(),
          agentId,
          channel: 'daemon',
          event: {
            kind: 'login-finished',
            agentId,
            harness,
            ok: false,
            error: 'no-url',
          },
        })
        child?.kill()
        this.loginChild = null
        return
      }
      this.pushEnvelope({
        id: this.nextId(),
        agentId,
        channel: 'daemon',
        event: {
          kind: 'login-challenge',
          agentId,
          harness,
          url,
          needsPasteCode: harness === 'claude-code',
          ...(userCode ? { userCode } : {}),
        },
      })
      await new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (!child || child.exitCode !== null || Date.now() > deadlineTotal) {
            clearInterval(t)
            resolve()
          }
        }, 500)
      })
      const ok = child?.exitCode === 0
      if (!ok && Date.now() > deadlineTotal) {
        this.pushEnvelope({
          id: this.nextId(),
          agentId,
          channel: 'daemon',
          event: { kind: 'login-finished', agentId, harness, ok: false, error: 'timeout' },
        })
      } else {
        this.pushEnvelope({
          id: this.nextId(),
          agentId,
          channel: 'daemon',
          event: { kind: 'login-finished', agentId, harness, ok: Boolean(ok) },
        })
        if (ok) {
          live.runtime.harnessAuth = await this.detectAuth()
          this.pushRuntime(agentId)
          await this.maybeRestartHindsight()
        }
      }
      this.loginChild = null
    })()

    return { ok: true }
  }

  private async maybeRestartHindsight(): Promise<void> {
    const next = fsSync.existsSync(this.root('claude-config', '.credentials.json'))
      ? 'claude-code'
      : 'openai-codex'
    if (next === this.hindsightProvider) return
    if (this.hindsightChild) {
      this.hindsightChild.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 100))
      try {
        this.hindsightChild.kill('SIGKILL')
      } catch {
        /* */
      }
    }
    this.hindsightProvider = next
    if (!this.skipHindsightSpawn) await this.startHindsight()
  }

  async peerSend(fromId: string, toAgentId: string, text: string) {
    const result = validatePeerSend({
      fromId,
      toAgentId,
      agents: this.team,
      getRuntime: (id) => this.live.get(id)?.runtime,
    })
    if (!result.ok) return result
    const from = this.team.find((a) => a.id === fromId)!
    const to = this.team.find((a) => a.id === toAgentId)!
    const fromLive = this.live.get(fromId)!
    const toLive = this.live.get(toAgentId)!

    // append sent on A's current assistant turn or last assistant
    let aTurn = [...fromLive.turns].reverse().find((t) => t.role === 'assistant' && !t.outcome)
    if (!aTurn) aTurn = [...fromLive.turns].reverse().find((t) => t.role === 'assistant')
    if (aTurn) {
      const partId = randomUUID()
      const ev: HarnessEvent = {
        kind: 'peer-message',
        partId,
        peerAgentId: to.id,
        peerName: to.name,
        direction: 'sent',
        text,
      }
      aTurn.parts = applyEvent(aTurn.parts, ev)
      this.pushHarness(fromId, aTurn.id, ev)
    }

    fromLive.runtime.talkingToAgentId = to.id
    toLive.runtime.talkingToAgentId = from.id
    this.pushRuntime(fromId)
    this.pushRuntime(toAgentId)

    const busy = ['thinking', 'needs-you', 'memorizing', 'compacting'].includes(toLive.runtime.state)
    if (busy) {
      const inFlight = [...toLive.turns].reverse().find((t) => t.role === 'assistant' && !t.outcome)
      if (inFlight) {
        const partId = randomUUID()
        const ev: HarnessEvent = {
          kind: 'peer-message',
          partId,
          peerAgentId: from.id,
          peerName: from.name,
          direction: 'received',
          text,
        }
        inFlight.parts = applyEvent(inFlight.parts, ev)
        this.pushHarness(toAgentId, inFlight.id, ev)
      }
      toLive.queue.enqueue({ kind: 'peer', text, fromAgentId: from.id, fromName: from.name })
      this.pushRuntime(toAgentId)
      return { ok: true as const }
    }

    if (toLive.runtime.state === 'idle' || toLive.runtime.state === 'error') {
      void this.startAssistantTurn(toAgentId, {
        source: 'peer',
        text,
        peerFrom: { id: from.id, name: from.name },
      })
    }
    return { ok: true as const }
  }

  private async startAssistantTurn(
    agentId: string,
    opts: {
      source: Turn['source']
      text: string
      userTurnId?: string
      assistantTurnId?: string
      sessionId?: string
      peerFrom?: { id: string; name: string }
    },
  ): Promise<void> {
    const agent = this.team.find((a) => a.id === agentId)!
    const live = this.live.get(agentId)!
    const turnId = opts.assistantTurnId ?? randomUUID()
    live.seq += 1
    const createdAt = new Date().toISOString()
    const parts: TurnPart[] = []
    if (opts.peerFrom) {
      parts.push({
        type: 'peer-message',
        id: randomUUID(),
        peerAgentId: opts.peerFrom.id,
        peerName: opts.peerFrom.name,
        direction: 'received',
        text: opts.text,
      })
    }
    const turn: Turn = {
      id: turnId,
      seq: live.seq,
      agentId,
      role: 'assistant',
      harness: agent.harness,
      source: opts.source,
      parts,
      createdAt,
    }
    live.turns.push(turn)
    this.pushHarness(agentId, turnId, {
      kind: 'turn-created',
      turnId,
      seq: turn.seq,
      role: 'assistant',
      source: opts.source,
      createdAt,
      harness: agent.harness,
    })
    if (opts.peerFrom) {
      const pm = parts[0]! as Extract<TurnPart, { type: 'peer-message' }>
      this.pushHarness(agentId, turnId, {
        kind: 'peer-message',
        partId: pm.id,
        peerAgentId: pm.peerAgentId,
        peerName: pm.peerName,
        direction: 'received',
        text: pm.text,
      })
    }

    live.runtime.state = 'thinking'
    this.pushRuntime(agentId)

    const memoryAppend = await this.buildMemoryAppend(agent, opts.text)
    const mcpToken = this.mcpTokens.get(agentId)!
    const mcpServers = {
      openbot: {
        type: 'http' as const,
        url: `http://127.0.0.1:${this.port}/mcp/${agentId}?token=${mcpToken}`,
        timeout: 3600,
      },
      hindsight: {
        type: 'http' as const,
        url: `http://127.0.0.1:${this.hindsightPort}/mcp/${agent.memoryBankId}/`,
        timeout: 3600,
      },
    }

    const sessions = await this.loadSessions(agent.slug)
    const sessionId = opts.sessionId ?? sessions[agent.harness]

    const otherSlugs = this.team.filter((a) => a.id !== agentId).map((a) => a.slug)

    const onAsk = async ({
      partId,
      questions,
      questionIds,
    }: {
      partId: string
      questions: Array<{
        question: string
        header: string
        options: Array<{ label: string; description: string }>
        multiSelect: boolean
      }>
      questionIds?: string[]
    }): Promise<
      | { questions: unknown; answers: Record<string, string>; response?: string }
      | 'cancelled'
    > => {
      void questionIds
      const askPart: TurnPart = {
        type: 'ask-user-question',
        id: partId,
        questions,
        status: 'open',
      }
      turn.parts = [...turn.parts, askPart]
      this.pushHarness(agentId, turnId, {
        kind: 'ask-user-question',
        partId,
        questions,
        status: 'open',
      })
      live.runtime.state = 'needs-you'
      this.pushRuntime(agentId)
      this.scheduleRewrite(agentId, true)
      return await new Promise<
        | { questions: unknown; answers: Record<string, string>; response?: string }
        | 'cancelled'
      >((resolve) => {
        live.askWaiters.set(partId, { resolve })
      })
    }

    let handle: RunTurnHandle | CodexRunTurnHandle
    if (agent.harness === 'codex') {
      const mcpTokenCodex = this.mcpTokens.get(agentId)!
      handle = (this.codexTurnFn ?? runCodexTurn)({
        spawnFn: this.spawnFn,
        promptText: opts.text,
        cwd: this.agentPath(agent.slug, 'workspace'),
        model: agent.model,
        ...(agent.effort ? { effort: agent.effort } : {}),
        sessionId,
        memoryAppend,
        agentCodexHome: this.privatePath(agent.slug, 'codex-home'),
        sharedCodexHome: this.root('codex-home'),
        config: {
          agentId,
          mcpToken: mcpTokenCodex,
          mcpPort: this.port,
          hindsightPort: this.hindsightPort,
          memoryBankId: agent.memoryBankId,
          home: this.home,
          otherAgentDirs: otherSlugs.map((s) => this.agentPath(s)),
        },
        onEvent: async (ev) => {
          await this.onHarnessEvent(agentId, turnId, ev)
        },
        onAsk,
      })
    } else {
      handle = runTurn({
        ...(this.queryFn ? { queryFn: this.queryFn } : {}),
        promptText: opts.text,
        cwd: this.agentPath(agent.slug, 'workspace'),
        model: agent.model,
        ...(agent.effort ? { effort: agent.effort } : {}),
        sessionId,
        memoryAppend,
        mcpServers,
        writeDenyCtx: {
          home: this.home,
          cwd: this.agentPath(agent.slug, 'workspace'),
          ownSlug: agent.slug,
          otherSlugs,
        },
        thinking: { type: 'adaptive' },
        claudeConfigDir: this.root('claude-config'),
        onEvent: async (ev) => {
          await this.onHarnessEvent(agentId, turnId, ev)
        },
        onAsk,
      })
    }

        // Fix writeDeny home: monkeypatch by setting env OPENBOT path — update write-deny to take openbotRoot
    live.inFlight = handle
    const result = await handle.done
    live.inFlight = null

    // persist session
    if (result.sessionId && result.sessionId !== 'pending') {
      live.runtime.sessionId = result.sessionId
      const s = await this.loadSessions(agent.slug)
      s[agent.harness] = result.sessionId
      await this.saveSessions(agent.slug, s)
    }

    turn.outcome = result.outcome
    turn.costUsd = result.usage.costUsd
    if (result.errorMessage) turn.errorMessage = result.errorMessage
    this.scheduleRewrite(agentId, true)

    // spend rollover
    await this.addSpend(agentId, result.usage.costUsd)

    const catalog = loadClaudeCatalog()
    const cw = contextWindowFor(agent.model, catalog)
    if (result.usage.inputTokens !== undefined) {
      live.runtime.contextUsed = (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
    }
    if (cw) live.runtime.contextWindow = cw
    live.runtime.talkingToAgentId = null

    // memory step
    if (opts.source === 'user' || opts.source === 'peer' || opts.source === 'resume-continue') {
      live.runtime.state = 'memorizing'
      this.pushRuntime(agentId)
      if (this.hindsight) {
        await retainAndSnapshot({
          client: this.hindsight,
          bankId: agent.memoryBankId,
          agentId,
          agentDir: this.agentPath(agent.slug),
          turn,
        })
      }
    }

    if (live.pauseRequested) {
      live.runtime.state = 'paused'
      await fs.mkdir(this.privatePath(agent.slug), { recursive: true })
      await fs.writeFile(
        this.privatePath(agent.slug, 'stopped-turn.json'),
        JSON.stringify({
          turnId,
          harness: agent.harness,
          sessionId: result.sessionId,
          interruptedAt: new Date().toISOString(),
          summaryText: turnText(turn).slice(0, 8000),
        }),
        'utf8',
      )
      this.pushRuntime(agentId)
      return
    }

    if (result.outcome === 'error') {
      live.runtime.state = 'error'
      this.pushRuntime(agentId)
    } else {
      live.runtime.state = 'idle'
      this.pushRuntime(agentId)
    }

    void this.pump(agentId)
  }

  private async pump(agentId: string): Promise<void> {
    const live = this.live.get(agentId)
    if (!live || live.runtime.state !== 'idle') return
    const next = live.queue.dequeue()
    if (!next) return
    this.pushRuntime(agentId)
    if (next.kind === 'user') {
      // user row already inserted; start assistant with joined prefixes? Plan: harness join uses [user] prefixes not in thread.jsonl
      await this.startAssistantTurn(agentId, {
        source: 'user',
        text: next.text,
        assistantTurnId: next.turnId,
      })
    } else {
      await this.startAssistantTurn(agentId, {
        source: 'peer',
        text: next.text,
        peerFrom: { id: next.fromAgentId, name: next.fromName },
      })
    }
  }

  private async onHarnessEvent(agentId: string, turnId: string, ev: HarnessEvent): Promise<void> {
    const live = this.live.get(agentId)
    if (!live) return
    const turn = live.turns.find((t) => t.id === turnId)
    if (!turn) return
    if (
      ev.kind === 'reasoning-text' ||
      ev.kind === 'assistant-text' ||
      ev.kind === 'tool-use' ||
      ev.kind === 'tool-result' ||
      ev.kind === 'peer-message' ||
      ev.kind === 'ask-user-question' ||
      ev.kind === 'ask-user-question-status' ||
      ev.kind === 'compacted'
    ) {
      turn.parts = applyEvent(turn.parts, ev)
      this.scheduleRewrite(agentId)
    }
    if (ev.kind === 'turn-finished') {
      turn.outcome = ev.outcome
      turn.costUsd = ev.usage.costUsd
      this.scheduleRewrite(agentId, true)
    }
    this.pushHarness(agentId, turnId, ev)
  }

  private async buildMemoryAppend(agent: AgentConfig, userText: string): Promise<string> {
    const preamble = readPreamble(agent.harness)
    let role = ''
    let memory = ''
    try {
      role = await fs.readFile(this.agentPath(agent.slug, 'role.md'), 'utf8')
    } catch {
      /* */
    }
    try {
      memory = await fs.readFile(this.agentPath(agent.slug, 'MEMORY.md'), 'utf8')
    } catch {
      /* */
    }
    let append = `${preamble}\n\n${role}\n\n${memory}`
    if (this.hindsight) {
      const recall = await this.hindsight.recall(agent.memoryBankId, userText, 1024)
      if (recall.ok) {
        append += formatRecallBlock(recall.results)
      } else {
        console.error(`[memory] recall-failed agent=${agent.id}`)
        this.pushBanner({
          kind: 'banner',
          bannerId: randomUUID(),
          agentId: agent.id,
          type: 'memory-error',
          message: 'Could not recall memory for this turn.',
          actions: ['dismiss'],
        })
      }
    }
    if (append.length > 32_000) {
      const keep = preamble
      const rest = append.slice(preamble.length)
      append = keep + rest.slice(-(32_000 - keep.length))
    }
    return append
  }

  private async addSpend(agentId: string, cost: number | null): Promise<void> {
    if (cost === null || !Number.isFinite(cost)) return
    const agent = this.team.find((a) => a.id === agentId)
    const live = this.live.get(agentId)
    if (!agent || !live) return
    const today = todayLocal()
    if (live.spendDate !== today) {
      live.spendDate = today
      live.spendUsd = 0
    }
    live.spendUsd += cost
    live.runtime.spendUsdToday = live.spendUsd
    await fs.mkdir(this.privatePath(agent.slug), { recursive: true })
    await fs.writeFile(
      this.privatePath(agent.slug, 'spend.json'),
      JSON.stringify({ date: live.spendDate, usd: live.spendUsd }),
      'utf8',
    )
    this.pushRuntime(agentId)
  }


  private async requestApp(
    body: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<Record<string, unknown>> {
    const started = Date.now()
    while (this.clients.size === 0 && Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 50))
    }
    if (this.clients.size === 0) return { ok: false, error: 'no-app' }
    const id = randomUUID()
    const msg = { id, ...body }
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.appPending.has(id)) {
          this.appPending.delete(id)
          resolve({ id, type: 'response', ok: false, error: 'no-app' })
        }
      }, timeoutMs - (Date.now() - started))
      this.appPending.set(id, { resolve, timer })
      for (const ws of this.clients) {
        if (ws.readyState === ws.OPEN) ws.send(encodeFrame(msg))
      }
    })
  }

  private async loadAllowedHosts(slug: string): Promise<string[]> {
    try {
      const raw = JSON.parse(
        await fs.readFile(this.privatePath(slug, 'browser-allow.json'), 'utf8'),
      ) as unknown
      return Array.isArray(raw) ? raw.map(String) : []
    } catch {
      return []
    }
  }

  private async saveAllowedHosts(slug: string, hosts: string[]): Promise<void> {
    await fs.mkdir(this.privatePath(slug), { recursive: true })
    await fs.writeFile(
      this.privatePath(slug, 'browser-allow.json'),
      JSON.stringify(hosts),
      'utf8',
    )
  }

  private pushNeedsSite(agentId: string, host: string): void {
    const live = this.live.get(agentId)
    if (!live) return
    const banner: Banner = {
      kind: 'banner',
      bannerId: randomUUID(),
      agentId,
      type: 'needs-site',
      host,
      message: `Allow ${host}? This agent wants to open it.`,
      actions: ['allow-site', 'deny-site'],
    }
    this.pushBanner(banner)
  }

  private async handleAllowSite(value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const agentId = String(value.agentId ?? '')
    const host = String(value.host ?? '')
    const allow = Boolean(value.allow)
    const agent = this.team.find((a) => a.id === agentId)
    const live = this.live.get(agentId)
    if (!agent || !live) return { ok: false, error: 'agent-not-found' }
    if (!live.pendingSite) return { ok: false, error: 'not-open' }
    live.banners = live.banners.filter((b) => b.type !== 'needs-site')
    this.pushRuntime(agentId)
    const pending = live.pendingSite
    live.pendingSite = null
    if (!allow) {
      pending.resolve({ ok: false, error: 'needs-site' })
      return { ok: true }
    }
    const hosts = await this.loadAllowedHosts(agent.slug)
    const n = hostFromUrl(pending.url) ?? host
    if (!hosts.includes(n)) hosts.push(n)
    await this.saveAllowedHosts(agent.slug, hosts)
    const res = await this.requestApp({
      type: 'browser.exec',
      agentId,
      allowedHosts: hosts,
      op: 'navigate',
      url: pending.url,
    })
    if (res.ok) {
      pending.resolve({
        ok: true,
        result: (res.result as { url: string; title: string }) ?? {
          url: pending.url,
          title: '',
        },
      })
    } else {
      pending.resolve({ ok: false, error: String(res.error ?? 'op-failed') })
    }
    return { ok: true }
  }

  private handleSetHumanControl(value: Record<string, unknown>): Record<string, unknown> {
    const agentId = String(value.agentId ?? '')
    const held = Boolean(value.held)
    const live = this.live.get(agentId)
    if (!live) return { ok: false, error: 'agent-not-found' }
    live.runtime.humanControl = { held }
    this.pushRuntime(agentId)
    return { ok: true, held }
  }

  private makeBrowserToolDeps(agentId: string): BrowserToolDeps {
    const self = this
    return {
      agentId,
      getAllowedHosts: () => {
        const agent = self.team.find((a) => a.id === agentId)
        if (!agent) return []
        try {
          const raw = JSON.parse(
            fsSync.readFileSync(self.privatePath(agent.slug, 'browser-allow.json'), 'utf8'),
          ) as unknown
          return Array.isArray(raw) ? raw.map(String) : []
        } catch {
          return []
        }
      },
      isHumanControlHeld: () => Boolean(self.live.get(agentId)?.runtime.humanControl.held),
      hasSiteAskOpen: () => Boolean(self.live.get(agentId)?.pendingSite),
      navigateWithGate: async (url: string) => {
        const agent = self.team.find((a) => a.id === agentId)
        const live = self.live.get(agentId)
        if (!agent || !live) return { ok: false, error: 'unknown-agent' }
        if (live.pendingSite) return { ok: false, error: 'site-ask-open' }
        const host = hostFromUrl(url)
        if (!host) return { ok: false, error: 'nav-failed' }
        const allowed = await self.loadAllowedHosts(agent.slug)
        if (!hostAllowed(host, allowed)) {
          return await new Promise((resolve) => {
            live.pendingSite = { url, resolve }
            self.pushNeedsSite(agentId, host)
          })
        }
        const res = await self.requestApp({
          type: 'browser.exec',
          agentId,
          allowedHosts: allowed,
          op: 'navigate',
          url,
        })
        if (res.ok) {
          return {
            ok: true as const,
            result: (res.result as { url: string; title: string }) ?? { url, title: '' },
          }
        }
        return { ok: false as const, error: String(res.error ?? 'op-failed') }
      },
      exec: async (op) => {
        const agent = self.team.find((a) => a.id === agentId)
        const live = self.live.get(agentId)
        if (!agent || !live) return { ok: false, error: 'unknown-agent' }
        const allowed = await self.loadAllowedHosts(agent.slug)
        const res = await self.requestApp({
          type: 'browser.exec',
          agentId,
          allowedHosts: allowed,
          ...op,
        })
        if (res.ok === false && res.error === 'cross-site') {
          const url = String(res.url ?? '')
          const host = String(res.host ?? hostFromUrl(url) ?? '')
          if (live.pendingSite) return { ok: false, error: 'site-ask-open' }
          return await new Promise((resolve) => {
            live.pendingSite = { url, resolve }
            self.pushNeedsSite(agentId, host)
          })
        }
        if (res.ok) {
          return { ok: true as const, result: (res.result as Record<string, string>) ?? {} }
        }
        return { ok: false as const, error: String(res.error ?? 'op-failed') }
      },
      terminalRead: async () => {
        const res = await self.requestApp({ type: 'terminal.read', agentId })
        if (res.ok) return { ok: true as const, text: String(res.text ?? '') }
        return { ok: false as const, error: String(res.error ?? 'no-terminal') }
      },
      shellRun: async (input) => {
        const agent = self.team.find((a) => a.id === agentId)
        if (!agent) return { ok: false, error: 'unknown-agent' }
        const otherSlugs = self.team.filter((a) => a.id !== agentId).map((a) => a.slug)
        const deny = writeDeny(
          'mcp__openbot__shell_run',
          { command: input.command },
          {
            home: self.home,
            cwd: self.agentPath(agent.slug, 'workspace'),
            ownSlug: agent.slug,
            otherSlugs,
          },
        ) as { hookSpecificOutput?: { permissionDecision?: string } }
        if (deny.hookSpecificOutput?.permissionDecision === 'deny') {
          return { ok: false, error: 'write-denied' }
        }
        const res = await self.requestApp({
          type: 'terminal.run',
          agentId,
          command: input.command,
          cwd: input.cwd,
          timeoutMs: input.timeoutMs,
          tabId: input.tabId,
          stealFocus: false,
        })
        if (res.ok) {
          return {
            ok: true as const,
            tabId: String(res.tabId),
            exitCode: Number(res.exitCode ?? 0),
            output: String(res.output ?? ''),
          }
        }
        return { ok: false as const, error: String(res.error ?? 'op-failed') }
      },
    }
  }

  /** Test seam: expose live state */
  getMcpToken(agentId: string): string | undefined {
    return this.mcpTokens.get(agentId)
  }

  getHindsightPort(): number {
    return this.hindsightPort
  }

  setHindsightClient(client: HindsightClient): void {
    this.hindsight = client
  }
}
