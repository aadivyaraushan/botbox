import fs from 'node:fs/promises'
import path from 'node:path'

export async function copySharedAuthToAgent(opts: {
  sharedCodexHome: string
  agentCodexHome: string
}): Promise<void> {
  await fs.mkdir(opts.agentCodexHome, { recursive: true })
  const src = path.join(opts.sharedCodexHome, 'auth.json')
  const dest = path.join(opts.agentCodexHome, 'auth.json')
  try {
    await fs.copyFile(src, dest)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') throw e
  }
}

export async function copyAgentAuthToShared(opts: {
  sharedCodexHome: string
  agentCodexHome: string
}): Promise<void> {
  const src = path.join(opts.agentCodexHome, 'auth.json')
  const dest = path.join(opts.sharedCodexHome, 'auth.json')
  try {
    await fs.mkdir(opts.sharedCodexHome, { recursive: true })
    const body = await fs.readFile(src)
    const tmp = dest + '.tmp'
    await fs.writeFile(tmp, body)
    await fs.rename(tmp, dest)
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== 'ENOENT') throw e
  }
}

export async function copyAuthSharedToAgent(sharedHome: string, agentHome: string): Promise<void> {
  await copySharedAuthToAgent({ sharedCodexHome: sharedHome, agentCodexHome: agentHome })
}

export async function copyAuthAgentToShared(agentHome: string, sharedHome: string): Promise<void> {
  await copyAgentAuthToShared({ sharedCodexHome: sharedHome, agentCodexHome: agentHome })
}
