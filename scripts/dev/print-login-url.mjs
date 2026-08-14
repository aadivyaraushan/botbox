#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const url = process.argv[2] ?? process.argv.find((a) => a.startsWith('http'))
const home = process.env.OPENBOT_HOME
if (!home) process.exit(0)
if (url && url.startsWith('http')) {
  fs.writeFileSync(path.join(home, 'login-url'), url)
}
process.exit(0)
