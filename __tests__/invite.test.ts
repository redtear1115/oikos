import { describe, it, expect } from 'vitest'
import { validateInviteAcceptance } from '@/lib/invite'

const baseInvite = {
  id: 'inv-1',
  groupId: 'grp-1',
  invitedBy: 'user-a',
  token: 'tok',
  expiresAt: new Date('2099-01-01'),
  acceptedAt: null,
  createdAt: new Date(),
}

const baseGroup = {
  id: 'grp-1',
  name: '我們家',
  memberA: 'user-a',
  memberB: null,
  createdAt: new Date(),
}

describe('validateInviteAcceptance', () => {
  it('returns ok for a valid invite', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b')
    expect(result).toEqual({ ok: true })
  })

  it('rejects null invite', () => {
    const result = validateInviteAcceptance(null, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false })
  })

  it('rejects already-accepted invite', () => {
    const invite = { ...baseInvite, acceptedAt: new Date('2025-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false, error: '邀請連結已被使用' })
  })

  it('rejects expired invite', () => {
    const invite = { ...baseInvite, expiresAt: new Date('2000-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b', new Date('2025-01-01'))
    expect(result).toMatchObject({ ok: false, error: '邀請連結已過期' })
  })

  it('rejects when group is full', () => {
    const group = { ...baseGroup, memberB: 'user-c' }
    const result = validateInviteAcceptance(baseInvite, group, 'user-b')
    expect(result).toMatchObject({ ok: false, error: '此帳本已有兩位成員' })
  })

  it('rejects when user is already the creator', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-a')
    expect(result).toMatchObject({ ok: false, error: '你已經是此帳本的成員' })
  })

  it('rejects when user is already memberB', () => {
    const group = { ...baseGroup, memberB: 'user-b' }
    const result = validateInviteAcceptance(baseInvite, group, 'user-b')
    expect(result).toMatchObject({ ok: false, error: '此帳本已有兩位成員' })
  })
})
