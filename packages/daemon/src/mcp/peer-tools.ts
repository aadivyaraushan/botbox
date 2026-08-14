import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { AgentConfig } from '@openbot/protocol'
import type { PeerSendResult } from '../peer/deliver.js'

export const LIST_AGENTS_DESC =
  "List the other people on this team. Returns each agent's id, name, and slug. Call this before message_agent if you do not know the id."

export const MESSAGE_AGENT_DESC =
  'Send work to another agent on this team. They receive the full text and start or continue their own thread. Use list_agents to get toAgentId. Do not message yourself.'

export function registerPeerTools(
  server: McpServer,
  opts: {
    callerId: string
    listOthers: () => Array<{ id: string; name: string; slug: string }>
    messageAgent: (toAgentId: string, text: string) => Promise<PeerSendResult>
  },
): void {
  server.tool('list_agents', LIST_AGENTS_DESC, {}, async () => {
    const others = opts.listOthers()
    return { content: [{ type: 'text', text: JSON.stringify(others) }] }
  })

  server.tool(
    'message_agent',
    MESSAGE_AGENT_DESC,
    { toAgentId: z.string(), text: z.string() },
    async ({ toAgentId, text }: { toAgentId: string; text: string }) => {
      const result = await opts.messageAgent(toAgentId, text)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    },
  )
}

export type { AgentConfig }
