import { defineConfig } from 'electron-vite'

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
  renderer: {},
})
