import type { IncomingMessage, ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { registerPeerTools } from './peer-tools.js'
import type { PeerSendResult } from '../peer/deliver.js'

export type McpDeps = {
  getToken: (agentId: string) => string | undefined
  listOthers: (callerId: string) => Array<{ id: string; name: string; slug: string }>
  messageAgent: (callerId: string, toAgentId: string, text: string) => Promise<PeerSendResult>
  onHandled?: (agentId: string, ok: boolean) => void
}

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: McpDeps,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const match = url.pathname.match(/^\/mcp\/([^/]+)\/?$/)
  if (!match) return false

  const agentId = decodeURIComponent(match[1]!)
  const token = url.searchParams.get('token') ?? ''
  const expected = deps.getToken(agentId)
  if (!expected || token !== expected) {
    res.writeHead(401)
    res.end()
    return true
  }

  const server = new McpServer({ name: 'openbot', version: '1' })
  registerPeerTools(server, {
    callerId: agentId,
    listOthers: () => deps.listOthers(agentId),
    messageAgent: (to, text) => deps.messageAgent(agentId, to, text),
  })

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)

  let body: unknown = undefined
  if (req.method === 'POST') {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    try {
      body = JSON.parse(raw)
    } catch {
      res.writeHead(400)
      res.end()
      return true
    }
  }

  try {
    await transport.handleRequest(req, res, body)
    deps.onHandled?.(agentId, true)
  } catch (e) {
    deps.onHandled?.(agentId, false)
    if (!res.headersSent) {
      res.writeHead(500)
      res.end(String(e))
    }
  }
  res.on('close', () => {
    void transport.close()
  })
  return true
}
