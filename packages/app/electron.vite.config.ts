import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: { build: { externalizeDeps: { exclude: ['@openbot/daemon', '@openbot/protocol'] } } },
  preload: {
    build: {
      externalizeDeps: { exclude: ['@openbot/daemon', '@openbot/protocol'] },
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@openbot/daemon/turns': resolve(__dirname, '../daemon/src/turns/reducer.ts'),
        '@openbot/protocol': resolve(__dirname, '../protocol/src/index.ts'),
      },
    },
  },
})
