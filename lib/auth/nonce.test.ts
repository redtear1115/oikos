import { describe, it, expect } from 'vitest'
import { generateNonce, sha256Hex } from './nonce'

describe('generateNonce', () => {
  it('returns a non-empty hex string', () => {
    const n = generateNonce()
    expect(n).toMatch(/^[0-9a-f]+$/)
    expect(n.length).toBeGreaterThanOrEqual(32)
  })

  it('returns a different value each call', () => {
    expect(generateNonce()).not.toBe(generateNonce())
  })
})

describe('sha256Hex', () => {
  it('produces the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('is deterministic', async () => {
    expect(await sha256Hex('hello')).toBe(await sha256Hex('hello'))
  })
})
