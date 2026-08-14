const { copyFileSync, chmodSync, mkdirSync, existsSync } = require('fs')
const { join } = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const helpersDir = join(context.appOutDir, `${appName}.app`, 'Contents', 'Helpers')
  mkdirSync(helpersDir, { recursive: true })
  const src = join(context.packager.projectDir, 'helpers', 'openbot-axclick')
  if (!existsSync(src)) {
    throw new Error(`[after-pack] missing helper at ${src}; run §5.5.7 swiftc first`)
  }
  const dest = join(helpersDir, 'openbot-axclick')
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
}
