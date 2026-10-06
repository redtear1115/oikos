import { describe, it, expect } from 'vitest'
import { resolvePolicyHolder } from '@/lib/insurancePolicyHolder'

const group = { memberA: 'user-a', memberB: 'user-b' }
const holder = (userId: string | null) => ({
  userId,
  displayName: userId ? 'Alex' : null,
  avatarUrl: userId ? 'https://img/alex.png' : null,
})

describe('resolvePolicyHolder (#1486)', () => {
  it('keeps name and avatar for a current member', () => {
    const r = resolvePolicyHolder(holder('user-b'), group, 'user-a')
    expect(r).toEqual({
      userId: 'user-b',
      displayName: 'Alex',
      avatarUrl: 'https://img/alex.png',
      isFormer: false,
    })
  })

  it('drops identity for a departed member', () => {
    const r = resolvePolicyHolder(holder('user-gone'), group, 'user-a')
    expect(r).toEqual({ userId: null, displayName: null, avatarUrl: null, isFormer: true })
    expect(JSON.stringify(r)).not.toContain('Alex')
    expect(JSON.stringify(r)).not.toContain('alex.png')
  })

  it('treats a solo ledger (no memberB) holder who left as former', () => {
    const r = resolvePolicyHolder(holder('user-gone'), { memberA: 'user-a', memberB: null }, 'user-a')
    expect(r.isFormer).toBe(true)
  })

  it('still shows the viewer as themselves (leaver reading a closed chapter)', () => {
    const r = resolvePolicyHolder(holder('user-me'), group, 'user-me')
    expect(r.isFormer).toBe(false)
    expect(r.displayName).toBe('Alex')
  })

  it('does not flag a policy with no holder', () => {
    const r = resolvePolicyHolder(holder(null), group, 'user-a')
    expect(r.isFormer).toBe(false)
  })
})
