import { describe, expect, it } from 'vitest'
import { isAppleSilicon } from './arch.js'

describe('isAppleSilicon', () => {
  it('returns true when process.arch is arm64', () => {
    expect(isAppleSilicon()).toBe(process.arch === 'arm64')
  })
})
