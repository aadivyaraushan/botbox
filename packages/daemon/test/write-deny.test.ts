import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeDeny } from '../src/claude/write-deny.js'

type DenyHookOut = {
  hookSpecificOutput?: {
    hookEventName?: string
    permissionDecision?: string
    permissionDecisionReason?: string
  }
}

describe('write-deny', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'))
  const ada = path.join(home, 'agents', 'ada')
  const bea = path.join(home, 'agents', 'bea')
  fs.mkdirSync(path.join(ada, 'workspace'), { recursive: true })
  fs.mkdirSync(bea, { recursive: true })
  fs.writeFileSync(path.join(bea, 'MEMORY.md'), 'x')
  fs.mkdirSync(path.join(home, 'private', 'bea'), { recursive: true })
  fs.writeFileSync(path.join(home, 'private', 'bea', 'browser-allow.json'), '{}')
  fs.writeFileSync(path.join(home, 'team.json'), '{}')
  const ctx = {
    home,
    cwd: path.join(ada, 'workspace'),
    ownSlug: 'ada',
    otherSlugs: ['bea'],
  }

  it('denies Bash redirect into other agent MEMORY', () => {
    const r = writeDeny(
      'Bash',
      { command: `echo x >> ${path.join(home, 'agents', 'bea', 'MEMORY.md')}` },
      ctx,
    ) as DenyHookOut
    expect(r).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: "Cannot write another agent's folder.",
      },
    })
  })

  it('denies NotebookEdit to bea MEMORY', () => {
    const r = writeDeny('NotebookEdit', { notebook_path: path.join(bea, 'MEMORY.md') }, ctx) as DenyHookOut
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
  })

  it('denies fake Patch tool path', () => {
    const r = writeDeny('Patch', { path: path.join(bea, 'file.txt') }, ctx) as DenyHookOut
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
  })

  it('denies Read of team.json', () => {
    const r = writeDeny('Read', { file_path: path.join(home, 'team.json') }, ctx) as DenyHookOut
    expect(r).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Cannot read OpenBot private files.',
      },
    })
  })

  it('denies Read of private browser-allow', () => {
    const r = writeDeny(
      'Read',
      { file_path: path.join(home, 'private', 'bea', 'browser-allow.json') },
      ctx,
    ) as DenyHookOut
    expect(r.hookSpecificOutput?.permissionDecisionReason).toBe('Cannot read OpenBot private files.')
  })

  it('allows Read of Bea MEMORY', () => {
    const r = writeDeny('Read', { file_path: path.join(bea, 'MEMORY.md') }, ctx) as DenyHookOut
    expect(r).toEqual({})
  })

  it('denies relative ../../bea/MEMORY.md Write', () => {
    const r = writeDeny('Write', { file_path: '../../bea/MEMORY.md' }, ctx) as DenyHookOut
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
  })

  it('denies quoted redirect and && chain', () => {
    expect(
      (
        writeDeny(
          'Bash',
          { command: "echo x >> '~/.openbot/agents/bea/MEMORY.md'" },
          {
            ...ctx,
            home: path.join(home),
          },
        ) as DenyHookOut
      ).hookSpecificOutput ||
        (
          writeDeny(
            'Bash',
            { command: `echo x >> '${path.join(home, 'agents', 'bea', 'MEMORY.md')}'` },
            ctx,
          ) as DenyHookOut
        ).hookSpecificOutput,
    ).toBeTruthy()
    const r = writeDeny('Bash', { command: 'true && echo x >> ../../bea/MEMORY.md' }, ctx) as DenyHookOut
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
  })

  it('denies Write under os.homedir()/.pg0 leftover path', () => {
    const leftover = path.join(os.homedir(), '.pg0', 'instances', 'hindsight', 'data')
    const r = writeDeny('Write', { file_path: leftover }, ctx) as DenyHookOut
    expect(r.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(r.hookSpecificOutput?.permissionDecisionReason).toBe('Cannot read OpenBot private files.')
  })
})
