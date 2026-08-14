#!/usr/bin/env node
/**
 * M1 ask-probe (§5.3): against real Claude Agent SDK on this Mac.
 * 1) init tools include AskUserQuestion
 * 2) prompt model to call AskUserQuestion; canUseTool fires (up to 3 attempts)
 */
import { query } from '@anthropic-ai/claude-agent-sdk'

const promptText =
  'Ask me one question using the AskUserQuestion tool: "Ship today or tomorrow?" with two options labelled "Today" and "Tomorrow". Do not answer in prose. Call the tool.'

async function* userTurns(text) {
  yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null }
}

let sawAskInInit = false
let canUseFired = false

for (let attempt = 1; attempt <= 3; attempt++) {
  canUseFired = false
  const q = query({
    prompt: userTurns(promptText),
    options: {
      permissionMode: 'default',
      includePartialMessages: true,
      canUseTool: async (toolName, input) => {
        if (toolName === 'AskUserQuestion') {
          canUseFired = true
          return {
            behavior: 'allow',
            updatedInput: {
              questions: input.questions,
              answers: { 'Ship today or tomorrow?': 'Today' },
            },
          }
        }
        return { behavior: 'allow', updatedInput: input }
      },
    },
  })

  for await (const message of q) {
    if (message.type === 'system' && message.subtype === 'init') {
      const tools = message.tools ?? message.mcp_servers ?? []
      const list = Array.isArray(tools) ? tools : []
      const names = list.map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean)
      // SDK may put tools on different fields — also check message itself
      const raw = JSON.stringify(message)
      if (names.includes('AskUserQuestion') || raw.includes('AskUserQuestion')) {
        sawAskInInit = true
      }
      if (!sawAskInInit) {
        console.error('ask-probe: AskUserQuestion missing from init tools — stop and revise')
        console.error(raw.slice(0, 2000))
        process.exit(1)
      }
    }
    if (message.type === 'result') break
  }

  if (canUseFired) {
    console.log(`ask-probe ok on attempt ${attempt}`)
    process.exit(0)
  }
  console.error(`ask-probe: attempt ${attempt} — model did not call AskUserQuestion`)
}

console.error('ask-probe: 3 misses — stop and revise')
process.exit(1)
