import { describe, it, expect } from 'vitest'
import { CryptoError } from '@/lib/crypto'
import {
  decryptShareToken,
  encryptShareToken,
  generateToken,
  hashToken,
  isWellFormedToken,
} from '@/lib/outing/tokens'

const OUTING_A = '11111111-1111-4111-8111-111111111111'
const OUTING_B = '22222222-2222-4222-8222-222222222222'

describe('lib/outing/tokens (#1558)', () => {
  it('generates 256-bit base64url tokens', () => {
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(t, 'base64url')).toHaveLength(32)
    expect(isWellFormedToken(t)).toBe(true)
  })

  it('does not repeat across many draws', () => {
    const seen = new Set(Array.from({ length: 1000 }, generateToken))
    expect(seen.size).toBe(1000)
  })

  it('rejects malformed tokens before lookup', () => {
    for (const bad of [undefined, null, 42, '', 'short', 'a'.repeat(44), `${'a'.repeat(42)}=`, `${'a'.repeat(42)}/`]) {
      expect(isWellFormedToken(bad)).toBe(false)
    }
  })

  it('hashes deterministically to sha256 hex, distinct per token', () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(t)).not.toBe(hashToken(generateToken()))
    // Known vector: sha256("abc")
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('round-trips the share token through encrypt/decrypt for the same outing', () => {
    const t = generateToken()
    const ct = encryptShareToken(t, OUTING_A)
    expect(ct).toMatch(/^v1:k1:/)
    expect(ct).not.toContain(t)
    expect(decryptShareToken(ct, OUTING_A)).toBe(t)
  })

  it('does not decrypt with a different outing id (AAD binds the row)', () => {
    const ct = encryptShareToken(generateToken(), OUTING_A)
    expect(() => decryptShareToken(ct, OUTING_B)).toThrow(CryptoError)
  })
})
