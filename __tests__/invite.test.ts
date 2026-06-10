import { describe, it, expect } from 'vitest'
import { validateInviteAcceptance } from '@/lib/invite'

const baseInvite = {
  id: 'inv-1',
  groupId: 'grp-1',
  invitedBy: 'user-a',
  token: 'tok',
  expiresAt: new Date('2099-01-01'),
  acceptedAt: null,
  revokedAt: null as Date | null,
  createdAt: new Date(),
}

const baseGroup = {
  id: 'grp-1',
  name: '我們家',
  memberA: 'user-a',
  memberB: null as string | null,
  createdAt: new Date(),
  defaultSplitRatioA: null as number | null,
  pendingSwapProposedBy: null as string | null,
  pendingSwapExpiresAt: null as Date | null,
  currentEpochStartedAt: new Date(),
  guardianBetaEnabled: false,
  baseCurrency: 'twd' as const,
}

describe('validateInviteAcceptance', () => {
  it('returns ok for a valid invite', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b')
    expect(result).toEqual({ ok: true })
  })

  it('rejects null invite', () => {
    const result = validateInviteAcceptance(null, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false, error: 'invalid_or_expired' })
  })

  it('rejects already-accepted invite', () => {
    const invite = { ...baseInvite, acceptedAt: new Date('2025-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false, error: 'already_used' })
  })

  it('rejects revoked invite (e.g. after partner left)', () => {
    const invite = { ...baseInvite, revokedAt: new Date('2025-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b')
    expect(result).toMatchObject({ ok: false, error: 'revoked' })
  })

  it('rejects expired invite', () => {
    const invite = { ...baseInvite, expiresAt: new Date('2000-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b', null, new Date('2025-01-01'))
    expect(result).toMatchObject({ ok: false, error: 'expired' })
  })

  it('rejects when group is full', () => {
    const group = { ...baseGroup, memberB: 'user-c' }
    const result = validateInviteAcceptance(baseInvite, group, 'user-b')
    expect(result).toMatchObject({ ok: false, error: 'group_full' })
  })

  it('rejects when user is already the creator', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-a')
    expect(result).toMatchObject({ ok: false, error: 'already_member' })
  })

  it('rejects when user is already memberB', () => {
    const group = { ...baseGroup, memberB: 'user-b' }
    const result = validateInviteAcceptance(baseInvite, group, 'user-b')
    expect(result).toMatchObject({ ok: false, error: 'group_full' })
  })

  it('blocks when the accepter is already in a DUO group elsewhere', () => {
    const myDuo = { ...baseGroup, id: 'grp-other', memberA: 'user-b', memberB: 'partner' }
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b', myDuo)
    expect(result).toEqual({ ok: false, error: 'already_in_duo' })
  })

  it('allows when the accepter is in a SOLO group elsewhere (no memberB)', () => {
    const mySolo = { ...baseGroup, id: 'grp-other', memberA: 'user-b', memberB: null }
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b', mySolo)
    expect(result).toEqual({ ok: true })
  })

  it('allows when the accepter has no group', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b', null)
    expect(result).toEqual({ ok: true })
  })
})
