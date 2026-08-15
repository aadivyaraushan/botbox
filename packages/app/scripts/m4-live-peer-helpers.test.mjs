import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PEER_BODY,
  ensureCodexAuth,
  peerMessagePrompt,
  findPeerMessageEvent,
  evidencePayload,
  parseOpenbotMcpFromConfig,
  stripHindsightMcp,
} from './m4-live-peer-helpers.mjs'

describe('peerMessagePrompt', () => {
  it('embeds Bea id and fixed body', () => {
    const p = peerMessagePrompt('bea-uuid', 'Bea')
    assert.match(p, /toAgentId="bea-uuid"/)
    assert.match(p, new RegExp(`"${PEER_BODY}"`))
    assert.match(p, /message_agent/)
  })
})

describe('parseOpenbotMcpFromConfig', () => {
  it('extracts agent id and token from toml url', () => {
    const toml = `
[mcp_servers.openbot]
url = "http://127.0.0.1:18874/mcp/ada-id?token=secret-tok"
tool_timeout_sec = 3600

[mcp_servers.hindsight]
url = "http://127.0.0.1:8888/mcp/bank/"
`
    const p = parseOpenbotMcpFromConfig(toml)
    assert.ok(p)
    assert.equal(p.agentId, 'ada-id')
    assert.equal(p.token, 'secret-tok')
  })

  it('returns null when missing', () => {
    assert.equal(parseOpenbotMcpFromConfig('approval_policy = "never"'), null)
  })
})

describe('stripHindsightMcp', () => {
  it('removes hindsight server block', () => {
    const toml = `[mcp_servers.openbot]
url = "http://x/mcp/a?token=t"

[mcp_servers.hindsight]
url = "http://127.0.0.1:8888/mcp/bank/"
tool_timeout_sec = 3600
`
    const out = stripHindsightMcp(toml)
    assert.match(out, /mcp_servers\.openbot/)
    assert.doesNotMatch(out, /mcp_servers\.hindsight/)
  })
})

describe('findPeerMessageEvent', () => {
  const events = [
    { channel: 'runtime', agentId: 'a' },
    {
      channel: 'harness',
      agentId: 'ada',
      turnId: 't1',
      event: {
        kind: 'peer-message',
        direction: 'sent',
        peerName: 'Bea',
        text: PEER_BODY,
      },
    },
    {
      channel: 'harness',
      agentId: 'bea',
      turnId: 't2',
      event: {
        kind: 'peer-message',
        direction: 'received',
        peerName: 'Ada',
        text: PEER_BODY,
      },
    },
  ]

  it('finds Ada sent marker event', () => {
    const hit = findPeerMessageEvent(events, {
      agentId: 'ada',
      direction: 'sent',
      peerName: 'Bea',
      textIncludes: PEER_BODY,
    })
    assert.ok(hit)
    assert.equal(hit.event.direction, 'sent')
  })

  it('finds Bea received marker event', () => {
    const hit = findPeerMessageEvent(events, {
      agentId: 'bea',
      direction: 'received',
      peerName: 'Ada',
      textIncludes: 'Please',
    })
    assert.ok(hit)
    assert.equal(hit.agentId, 'bea')
  })

  it('returns null when missing', () => {
    assert.equal(
      findPeerMessageEvent(events, { direction: 'sent', peerName: 'Nobody' }),
      null,
    )
  })
})

describe('ensureCodexAuth', () => {
  it('copies auth into temp home', () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-codex-src-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-home-'))
    fs.writeFileSync(path.join(shared, 'auth.json'), '{"tok":"x"}')
    const r = ensureCodexAuth(shared, home)
    assert.equal(r.ok, true)
    assert.equal(fs.readFileSync(r.authDest, 'utf8'), '{"tok":"x"}')
  })

  it('fails when shared auth missing', () => {
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-codex-missing-'))
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-home-'))
    const r = ensureCodexAuth(shared, home)
    assert.equal(r.ok, false)
    assert.equal(r.error, 'missing-auth')
  })
})

describe('evidencePayload', () => {
  it('marks real daemon and codex pair', () => {
    const e = evidencePayload({ ok: true, adaId: '1', beaId: '2' })
    assert.equal(e.daemon, 'real')
    assert.equal(e.harnessPair, 'codex+codex')
    assert.equal(e.peerBody, PEER_BODY)
    assert.equal(e.ok, true)
  })
})
