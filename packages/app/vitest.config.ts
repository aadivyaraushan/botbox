import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/main/arch.test.ts',
      'src/main/admin-token.test.ts',
      'src/main/daemon-spawn.test.ts',
      'src/main/daemon-ws-ready.test.ts',
      'src/main/tray-notify.test.ts',
      'src/renderer/daemon-list-sync.test.ts',
      'src/renderer/thread-ask/ask-answers.test.ts',
      'src/renderer/thread-peer/peer-marker.test.ts',
      'src/renderer/thread/fold/fold-turn.test.ts',
      'src/renderer/thread/fold/fold-turn-queued.test.ts',
      'src/renderer/thread/reasoning-summary.test.ts',
      'src/renderer/thread/stick-scroll.test.ts',
      'src/renderer/browser/suggest-url.test.ts',
      'test/packaging.test.ts',
    ],
    environment: 'node',
  },
})
