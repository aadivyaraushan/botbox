import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CURSOR_BUNDLE_ID,
  classifyLoginPreflight,
  formatPreflightFailure,
} from './login-screen-preflight.mjs'

describe('classifyLoginPreflight', () => {
  it('passes when Accessibility works and Chrome window capture succeeds', () => {
    const r = classifyLoginPreflight({
      accessibilityOk: true,
      chromeRunning: true,
      chromeWindowId: 26537,
      windowCaptureOk: true,
      windowCaptureStderr: '',
      openChromeCommand: ['open', '-a', 'Google Chrome', '--', 'https://auth.openai.com/x'],
    })
    assert.equal(r.ok, true)
  })

  it('fails closed when Screen Recording cannot capture a Chrome window', () => {
    const r = classifyLoginPreflight({
      accessibilityOk: true,
      chromeRunning: true,
      chromeWindowId: 26537,
      windowCaptureOk: false,
      windowCaptureStderr: 'could not create image from window',
      openChromeCommand: ['open', '-a', 'Google Chrome', '--', 'https://auth.openai.com/x'],
    })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'screen-recording')
    const msg = formatPreflightFailure(r)
    assert.match(msg, /Screen Recording/)
    assert.match(msg, new RegExp(CURSOR_BUNDLE_ID))
    assert.match(msg, /Do not ask the human to finish OpenAI login/)
    assert.doesNotMatch(msg, /Complete Codex CLI login in Chrome|human must finish/i)
  })

  it('fails closed when Accessibility probe fails', () => {
    const r = classifyLoginPreflight({
      accessibilityOk: false,
      chromeRunning: true,
      chromeWindowId: 1,
      windowCaptureOk: true,
      windowCaptureStderr: '',
      openChromeCommand: ['open', '-a', 'Google Chrome', '--', 'https://example.com'],
    })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'accessibility')
    assert.match(formatPreflightFailure(r), /Accessibility/)
  })

  it('fails closed when Chrome has no window to capture', () => {
    const r = classifyLoginPreflight({
      accessibilityOk: true,
      chromeRunning: true,
      chromeWindowId: null,
      windowCaptureOk: false,
      windowCaptureStderr: '',
      openChromeCommand: ['open', '-a', 'Google Chrome', '--', 'https://example.com'],
    })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'chrome-window')
  })

  it('fails closed when auth URL was not opened via Google Chrome app flag', () => {
    const r = classifyLoginPreflight({
      accessibilityOk: true,
      chromeRunning: true,
      chromeWindowId: 1,
      windowCaptureOk: true,
      windowCaptureStderr: '',
      openChromeCommand: ['open', 'https://auth.openai.com/x'],
    })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'open-chrome')
  })

  it('treats wallpaper-only display capture as Screen Recording miss when Chrome window exists', () => {
    const r = classifyLoginPreflight({
      accessibilityOk: true,
      chromeRunning: true,
      chromeWindowId: 26537,
      windowCaptureOk: false,
      windowCaptureStderr: 'could not create image from window',
      displayCaptureLooksEmpty: true,
      openChromeCommand: ['open', '-a', 'Google Chrome', '--', 'https://auth.openai.com/x'],
    })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'screen-recording')
  })
})
