#!/usr/bin/env node
/**
 * Fail-closed Mac login preflight for harness auth.
 *
 * Callers: scripts/dev/login.mjs (before harness.startLogin);
 * e2e/computer-use/harness-login.md Preflight (agents must run this CLI).
 *
 * Exit codes: 0 ok; 2 screen-recording; 3 accessibility; 4 chrome-window; 5 open-chrome; 1 other.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const CURSOR_BUNDLE_ID = 'com.todesktop.230313mzl4w4u92'
export const PREFLIGHT_WINDOW_PNG = '/tmp/openbot-login-preflight-window.png'
export const PREFLIGHT_DISPLAY_PNG = '/tmp/openbot-login-preflight.png'

/** @typedef {'screen-recording'|'accessibility'|'chrome-window'|'open-chrome'} PreflightCode */

/**
 * Pure classifier for unit tests and the live probe.
 * @param {{
 *   accessibilityOk: boolean,
 *   chromeRunning: boolean,
 *   chromeWindowId: number|null,
 *   windowCaptureOk: boolean,
 *   windowCaptureStderr: string,
 *   openChromeCommand: string[],
 *   displayCaptureLooksEmpty?: boolean,
 * }} input
 * @returns {{ ok: true } | { ok: false, code: PreflightCode, detail: string }}
 */
export function classifyLoginPreflight(input) {
  if (!isOpenChromeCommand(input.openChromeCommand)) {
    return {
      ok: false,
      code: 'open-chrome',
      detail: 'Auth URL must open only via: open -a "Google Chrome" -- <url>',
    }
  }
  if (!input.accessibilityOk) {
    return {
      ok: false,
      code: 'accessibility',
      detail: 'System Events probe failed',
    }
  }
  if (!input.chromeRunning || input.chromeWindowId == null) {
    return {
      ok: false,
      code: 'chrome-window',
      detail: 'Google Chrome has no on-screen window to capture',
    }
  }
  if (!input.windowCaptureOk) {
    return {
      ok: false,
      code: 'screen-recording',
      detail:
        input.windowCaptureStderr.trim() ||
        (input.displayCaptureLooksEmpty
          ? 'display capture is wallpaper-only while Chrome window exists'
          : 'screencapture -l failed'),
    }
  }
  return { ok: true }
}

/** @param {string[]} argv */
export function isOpenChromeCommand(argv) {
  if (!Array.isArray(argv) || argv.length < 5) return false
  const [bin, dashA, app, dashDash, url] = argv
  return (
    bin === 'open' &&
    dashA === '-a' &&
    app === 'Google Chrome' &&
    dashDash === '--' &&
    typeof url === 'string' &&
    url.startsWith('http')
  )
}

/** @param {{ ok: false, code: PreflightCode, detail: string }} result */
export function formatPreflightFailure(result) {
  if (result.code === 'screen-recording') {
    return [
      '[openbot-login-preflight] FAIL: Screen Recording cannot capture a real Chrome window.',
      `Evidence: ${result.detail}`,
      `Grant System Settings → Privacy & Security → Screen Recording → enable Cursor (${CURSOR_BUNDLE_ID}).`,
      'Do not ask the human to finish OpenAI login or click Allow in Chrome.',
    ].join('\n')
  }
  if (result.code === 'accessibility') {
    return [
      '[openbot-login-preflight] FAIL: Accessibility cannot drive Chrome / click Allow.',
      `Evidence: ${result.detail}`,
      `Grant System Settings → Privacy & Security → Accessibility → enable Cursor (${CURSOR_BUNDLE_ID}).`,
      'Do not ask the human to finish OpenAI login or click Allow in Chrome.',
    ].join('\n')
  }
  if (result.code === 'chrome-window') {
    return [
      '[openbot-login-preflight] FAIL: no Google Chrome window to capture.',
      `Evidence: ${result.detail}`,
      'Open Google Chrome first (open -a "Google Chrome"), then retry.',
    ].join('\n')
  }
  return [
    '[openbot-login-preflight] FAIL: auth URL open command is wrong.',
    `Evidence: ${result.detail}`,
  ].join('\n')
}

export function exitCodeFor(result) {
  if (result.ok) return 0
  switch (result.code) {
    case 'screen-recording':
      return 2
    case 'accessibility':
      return 3
    case 'chrome-window':
      return 4
    case 'open-chrome':
      return 5
    default:
      return 1
  }
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8' })
}

export function probeAccessibility() {
  const r = run('osascript', ['-e', 'tell application "System Events" to get name of first process'])
  return r.status === 0 && Boolean(r.stdout?.trim())
}

export function probeChromeRunning() {
  const r = run('osascript', ['-e', 'tell application "Google Chrome" to get name'])
  return r.status === 0
}

/** @returns {number|null} CGWindowID of first on-screen Chrome window */
export function probeChromeWindowId() {
  const swiftPath = '/tmp/openbot-chrome-window-id.swift'
  const swift = `import Cocoa
let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
guard let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { exit(1) }
let chrome = info.filter {
  ($0[kCGWindowOwnerName as String] as? String) == "Google Chrome"
    && ($0[kCGWindowLayer as String] as? Int) == 0
}
guard let first = chrome.first, let id = first[kCGWindowNumber as String] as? Int else { exit(2) }
print(id)
`
  fs.writeFileSync(swiftPath, swift)
  const r = run('swift', [swiftPath])
  if (r.status !== 0) return null
  const id = Number.parseInt(String(r.stdout).trim(), 10)
  return Number.isFinite(id) ? id : null
}

/** @param {number} windowId */
export function probeWindowCapture(windowId, outPath = PREFLIGHT_WINDOW_PNG) {
  try {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
  } catch {
    /* ignore */
  }
  const r = run('/usr/sbin/screencapture', ['-l', String(windowId), '-t', 'png', outPath])
  const ok = r.status === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0
  return { ok, stderr: String(r.stderr ?? '') }
}

/**
 * Live fail-closed preflight. Does not open the auth URL; validates open argv shape when provided.
 * @param {{ openChromeCommand?: string[], ensureChrome?: boolean }} [opts]
 */
export function runLoginScreenPreflight(opts = {}) {
  const openChromeCommand =
    opts.openChromeCommand ??
    ['open', '-a', 'Google Chrome', '--', 'https://example.com/openbot-preflight-probe']

  if (opts.ensureChrome !== false && process.platform === 'darwin') {
    if (!probeChromeRunning()) {
      run('open', ['-a', 'Google Chrome'])
      spawnSync('python3', ['-c', 'import time; time.sleep(1.5)'], { encoding: 'utf8' })
    }
  }

  const accessibilityOk = probeAccessibility()
  const chromeRunning = probeChromeRunning()
  const chromeWindowId = chromeRunning ? probeChromeWindowId() : null
  let windowCaptureOk = false
  let windowCaptureStderr = ''
  if (chromeWindowId != null) {
    const cap = probeWindowCapture(chromeWindowId)
    windowCaptureOk = cap.ok
    windowCaptureStderr = cap.stderr
  }

  const result = classifyLoginPreflight({
    accessibilityOk,
    chromeRunning,
    chromeWindowId,
    windowCaptureOk,
    windowCaptureStderr,
    openChromeCommand,
    displayCaptureLooksEmpty: !windowCaptureOk && chromeWindowId != null,
  })

  return {
    result,
    chromeWindowId,
    windowPng: windowCaptureOk ? PREFLIGHT_WINDOW_PNG : null,
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (isMain) {
  if (process.platform !== 'darwin') {
    console.error('[openbot-login-preflight] macOS only')
    process.exit(1)
  }
  const { result } = runLoginScreenPreflight()
  if (!result.ok) {
    console.error(formatPreflightFailure(result))
    process.exit(exitCodeFor(result))
  }
  console.log('[openbot-login-preflight] ok: Chrome window capture + Accessibility')
  process.exit(0)
}
