import { describe, it, expect } from 'vitest'
import { generateShareToken, generateClaimToken } from '@/lib/outing/token'

describe('outing tokens', () => {
  it('share token is a long url-safe string', () => {
    const t = generateShareToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('claim token is a long url-safe string', () => {
    const t = generateClaimToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('tokens are unique across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateShareToken()))
    expect(set.size).toBe(100)
  })
})
