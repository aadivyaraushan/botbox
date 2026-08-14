import { describe, expect, it, vi } from 'vitest'
import { notifyAgent, type NotifyDeps } from './tray-notify.js'

function makeDeps(overrides: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    isSupported: () => true,
    show: vi.fn(),
    isFocused: () => false,
    selectAgent: vi.fn(),
    log: vi.fn(),
    ...overrides,
  }
}

describe('tray-notify', () => {
  it('does not throw when Notification is unsupported', () => {
    const deps = makeDeps({
      isSupported: () => false,
      show: vi.fn(() => {
        throw new Error('should not show')
      }),
    })
    expect(() =>
      notifyAgent(deps, {
        agentId: 'a1',
        title: 'Needs you',
        body: 'Ada needs an answer',
      }),
    ).not.toThrow()
    expect(deps.log).toHaveBeenCalledWith('[notify] unsupported')
    expect(deps.show).not.toHaveBeenCalled()
  })

  it('does not throw when show fails (permission denied)', () => {
    const deps = makeDeps({
      show: vi.fn(() => {
        throw new Error('denied')
      }),
    })
    expect(() =>
      notifyAgent(deps, {
        agentId: 'a1',
        title: 'Needs you',
        body: 'Ada needs an answer',
      }),
    ).not.toThrow()
    expect(deps.log).toHaveBeenCalledWith('[notify] permission-denied')
  })

  it('click handler routes to the correct agentId', () => {
    let click: (() => void) | undefined
    const deps = makeDeps({
      show: vi.fn((opts) => {
        click = opts.onClick
      }),
    })
    notifyAgent(deps, {
      agentId: 'agent-bea',
      title: 'Done',
      body: 'Bea finished',
    })
    expect(click).toBeTypeOf('function')
    click!()
    expect(deps.selectAgent).toHaveBeenCalledWith('agent-bea')
  })
})
