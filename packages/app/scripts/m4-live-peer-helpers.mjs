import fs from 'node:fs'
import path from 'node:path'

export const PEER_BODY = 'Please help'

/** Copy shared Codex auth into a temp OPENBOT_HOME codex-home. */
export function ensureCodexAuth(sharedCodexHome, openbotHome) {
  const authSrc = path.join(sharedCodexHome, 'auth.json')
  const authDest = path.join(openbotHome, 'codex-home', 'auth.json')
  if (!fs.existsSync(authSrc)) {
    return { ok: false, error: 'missing-auth', authSrc, authDest }
  }
  fs.mkdirSync(path.dirname(authDest), { recursive: true })
  if (path.resolve(authSrc) !== path.resolve(authDest)) {
    fs.copyFileSync(authSrc, authDest)
  }
  return { ok: true, authSrc, authDest }
}

/** Prompt that forces Ada to MCP-message Bea with a fixed body. */
export function peerMessagePrompt(beaId, beaName = 'Bea', body = PEER_BODY) {
  return [
    `Call the openbot MCP tool message_agent exactly once.`,
    `Use toAgentId="${beaId}" (teammate ${beaName}) and text exactly "${body}".`,
    `Do not ask questions. Do not call other tools after message_agent succeeds.`,
  ].join(' ')
}

/**
 * Parse openbot MCP URL from a Codex config.toml written by the daemon.
 * @param {string} toml
 * @returns {{ url: string, agentId: string, token: string } | null}
 */
export function parseOpenbotMcpFromConfig(toml) {
  const m = String(toml).match(
    /\[mcp_servers\.openbot\][\s\S]*?url\s*=\s*"([^"]+)"/,
  )
  if (!m) return null
  const url = m[1]
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    const agentId = parts[1]
    const token = u.searchParams.get('token')
    if (!agentId || !token) return null
    return { url, agentId, token }
  } catch {
    return null
  }
}

/** Drop dead hindsight MCP block so Codex does not hang when Hindsight is skipped. */
export function stripHindsightMcp(toml) {
  return String(toml).replace(/\n\[mcp_servers\.hindsight\][\s\S]*?(?=\n\[|\s*$)/, '\n')
}

/**
 * Call message_agent on the real Daemon MCP HTTP path (same path Codex uses).
 * @param {{ port: number, agentId: string, token: string, toAgentId: string, text: string }} opts
 */
export async function callMessageAgentMcp(opts) {
  const base = `http://127.0.0.1:${opts.port}/mcp/${opts.agentId}?token=${opts.token}`
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'm4-real-surface', version: '1' },
      },
    }),
  })
  const r = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'message_agent',
        arguments: { toAgentId: opts.toAgentId, text: opts.text },
      },
    }),
  })
  const text = await r.text()
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
  const json = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text)
  const content = json.result?.content?.[0]?.text
  return content ? JSON.parse(content) : json
}

/**
 * Scan WS envelopes for a harness peer-message event.
 * @param {unknown[]} events
 * @param {{ agentId?: string, direction: 'sent'|'received', peerName?: string, textIncludes?: string }} want
 */
export function findPeerMessageEvent(events, want) {
  for (const env of events) {
    if (!env || typeof env !== 'object') continue
    const e = /** @type {Record<string, unknown>} */ (env)
    if (e.channel !== 'harness') continue
    if (want.agentId && e.agentId !== want.agentId) continue
    const ev = e.event
    if (!ev || typeof ev !== 'object') continue
    const peer = /** @type {Record<string, unknown>} */ (ev)
    if (peer.kind !== 'peer-message') continue
    if (peer.direction !== want.direction) continue
    if (want.peerName && peer.peerName !== want.peerName) continue
    if (want.textIncludes && !String(peer.text ?? '').includes(want.textIncludes)) continue
    return { agentId: e.agentId, turnId: e.turnId, event: peer }
  }
  return null
}

export function evidencePayload(parts) {
  return {
    ok: Boolean(parts.ok),
    daemon: 'real',
    harnessPair: 'codex+codex',
    peerBody: PEER_BODY,
    ...parts,
  }
}
