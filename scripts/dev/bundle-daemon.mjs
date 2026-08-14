#!/usr/bin/env node
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'resources', 'daemon')
const entry = join(root, 'packages/daemon/src/main.ts')
const require = createRequire(import.meta.url)

async function loadEsbuild() {
  const candidates = [
    join(root, 'node_modules/esbuild/lib/main.js'),
    join(root, 'packages/app/node_modules/esbuild/lib/main.js'),
    join(root, 'node_modules/tsx/node_modules/esbuild/lib/main.js'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      return import(pathToFileURL(p).href)
    }
  }
  try {
    const resolved = require.resolve('esbuild')
    return import(pathToFileURL(resolved).href)
  } catch {
    /* fall through */
  }
  throw new Error('[bundle-daemon] esbuild not found; pnpm add -Dw esbuild')
}

async function main() {
  const esbuild = await loadEsbuild()
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  mkdirSync(join(outDir, 'memory'), { recursive: true })
  mkdirSync(join(outDir, 'harness'), { recursive: true })
  mkdirSync(join(outDir, 'scripts', 'dev'), { recursive: true })

  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: join(outDir, 'main.mjs'),
    banner: {
      js: "import { createRequire as __openbotCreateRequire } from 'node:module'; const require = __openbotCreateRequire(import.meta.url);",
    },
    packages: 'bundle',
    external: ['electron'],
    logLevel: 'info',
  })

  const copies = [
    ['packages/daemon/src/memory/preamble.md', 'memory/preamble.md'],
    ['packages/daemon/src/memory/preamble-browser.md', 'memory/preamble-browser.md'],
    ['packages/daemon/src/memory/hindsight-pin.json', 'memory/hindsight-pin.json'],
    ['packages/daemon/src/harness/compact-prompt.md', 'harness/compact-prompt.md'],
    ['packages/daemon/src/claude/models.json', 'models.json'],
    ['scripts/dev/print-login-url.mjs', 'scripts/dev/print-login-url.mjs'],
  ]
  for (const [from, to] of copies) {
    const src = join(root, from)
    if (!existsSync(src)) throw new Error(`[bundle-daemon] missing ${src}`)
    copyFileSync(src, join(outDir, to))
  }

  writeFileSync(join(outDir, '.bundle-ok'), `${new Date().toISOString()}\n`)
  console.log(`[bundle-daemon] wrote ${join(outDir, 'main.mjs')}`)
}

main().catch((err) => {
  console.error('[bundle-daemon]', err)
  process.exit(1)
})
