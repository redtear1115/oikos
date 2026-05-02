import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '@/lib/crypto'

describe('crypto', () => {
  it('round-trips a string correctly', () => {
    const plaintext = 'A123456789'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'same input'
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext))
  })

  it('throws on tampered ciphertext payload', () => {
    const ciphertext = encrypt('secret')
    const tampered = ciphertext.slice(0, -4) + 'xxxx'
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws on tampered auth tag', () => {
    const [iv, , encrypted] = encrypt('secret').split(':')
    const fakeTag = 'deadbeefdeadbeefdeadbeefdeadbeef'
    expect(() => decrypt(`${iv}:${fakeTag}:${encrypted}`)).toThrow()
  })
})
