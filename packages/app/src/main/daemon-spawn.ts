import { join } from 'node:path'

export type DaemonSpawnInput = {
  isPackaged: boolean
  resourcesPath: string
  repoRoot: string
  execPath: string
  adminToken: string
  env: NodeJS.ProcessEnv
}

export type DaemonSpawnSpec = {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export function resolveDaemonSpawn(input: DaemonSpawnInput): DaemonSpawnSpec {
  if (input.isPackaged) {
    const daemonRoot = join(input.resourcesPath, 'daemon')
    const entry = join(daemonRoot, 'main.mjs')
    return {
      command: input.execPath,
      args: [entry],
      env: {
        ...input.env,
        ELECTRON_RUN_AS_NODE: '1',
        OPENBOT_ADMIN_TOKEN: input.adminToken,
        OPENBOT_REPO_ROOT: daemonRoot,
        OPENBOT_HINDSIGHT_ROOT: join(input.resourcesPath, 'hindsight'),
      },
    }
  }

  return {
    command: join(input.repoRoot, 'node_modules/.bin/tsx'),
    args: [join(input.repoRoot, 'packages/daemon/src/main.ts')],
    env: {
      ...input.env,
      OPENBOT_ADMIN_TOKEN: input.adminToken,
    },
  }
}
