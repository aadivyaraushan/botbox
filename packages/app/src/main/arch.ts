export function isAppleSilicon(): boolean {
  return process.arch === 'arm64'
}
