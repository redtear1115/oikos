import { describe, it, expect } from 'vitest'
import { classifyGroupClaimMiss, classifyUnclaimableInvite, validateInviteAcceptance } from '@/lib/invite'

const baseInvite = {
  id: 'inv-1',
  groupId: 'grp-1',
  invitedBy: 'user-a',
  token: 'tok',
  tokenHash: null as string | null,
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

  // #1288 — minting supersedes every open invite, expired ones included, so a
  // link that simply ran out is usually also revoked. It must still read as
  // expired, not as revoked.
  it('reports expired before revoked when an invite is both', () => {
    const invite = { ...baseInvite, expiresAt: new Date('2000-01-01'), revokedAt: new Date('2025-01-01') }
    const result = validateInviteAcceptance(invite, baseGroup, 'user-b', null, new Date('2025-01-01'))
    expect(result).toEqual({ ok: false, error: 'expired' })
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

  // Unchanged by #1031. This is the BENIGN twin of the attack below: the
  // accepter happens to keep a solo ledger of their own, but the invite was
  // minted by `user-a`, who is still `baseGroup.memberA`. The inviter-still-a-
  // member gate is exactly what separates this from the ex-partner case — so
  // the assertion stays `{ ok: true }`.
  it('allows when the accepter is in a SOLO group elsewhere (no memberB)', () => {
    const mySolo = { ...baseGroup, id: 'grp-other', memberA: 'user-b', memberB: null }
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b', mySolo)
    expect(result).toEqual({ ok: true })
  })

  it('allows when the accepter has no group', () => {
    const result = validateInviteAcceptance(baseInvite, baseGroup, 'user-b', null)
    expect(result).toEqual({ ok: true })
  })

  // ─── #1031 — the minter must still be a member ────────────────────────────
  // Defence in depth behind `createInvite()` dropping its groupId parameter.
  // The validator previously had no notion of WHO issued the invite, so an
  // invite minted by a non-member was indistinguishable from a real one.

  it('rejects an invite minted by an ex-partner who already left the group (#1031)', () => {
    // The attack: `ex` and `victim` were a duo in grp-1. `ex` leaveGroup'd, so
    // grp-1 is back to solo with `victim` as memberA and `ex` sitting in their
    // own fresh solo ledger. `ex` then mints an invite for grp-1 (whose id they
    // still hold from every dashboard payload they ever loaded) and accepts it
    // themselves. Every other gate passes — it is only `invitedBy` that gives
    // the forgery away.
    const groupAfterExLeft = { ...baseGroup, memberA: 'victim', memberB: null }
    const exMintedInvite = { ...baseInvite, invitedBy: 'ex' }
    const exSoloLedger = { ...baseGroup, id: 'grp-ex', memberA: 'ex', memberB: null }

    const result = validateInviteAcceptance(exMintedInvite, groupAfterExLeft, 'ex', exSoloLedger)
    expect(result).toEqual({ ok: false, error: 'inviter_not_member' })
  })

  it('rejects an invite whose minter is a stranger to the group (#1031)', () => {
    // Same gate, forged rather than self-minted: kills the class, not just the
    // one instance.
    const forged = { ...baseInvite, invitedBy: 'stranger' }
    const result = validateInviteAcceptance(forged, baseGroup, 'user-b', null)
    expect(result).toEqual({ ok: false, error: 'inviter_not_member' })
  })

  it('still allows an invite minted by the remaining member after a partner left', () => {
    // The legitimate re-invite: `victim` stayed, so they can invite again.
    const groupAfterPartnerLeft = { ...baseGroup, memberA: 'victim', memberB: null }
    const victimMinted = { ...baseInvite, invitedBy: 'victim' }
    const result = validateInviteAcceptance(victimMinted, groupAfterPartnerLeft, 'newcomer', null)
    expect(result).toEqual({ ok: true })
  })
})

// #1288 — acceptInvite's atomic claim matched no row; name the reason from the
// row as re-read inside the transaction.
describe('classifyUnclaimableInvite', () => {
  const open = { acceptedAt: null, revokedAt: null, expiredByDbClock: false }

  it('a vanished row is invalid_or_expired', () => {
    expect(classifyUnclaimableInvite(null)).toBe('invalid_or_expired')
  })

  it('a row a concurrent accept claimed first is already_used', () => {
    expect(classifyUnclaimableInvite({ ...open, acceptedAt: new Date() })).toBe('already_used')
  })

  it('a row revoked after validation is revoked', () => {
    expect(classifyUnclaimableInvite({ ...open, revokedAt: new Date() })).toBe('revoked')
  })

  it('a row that expired by the DB clock is expired, even if also revoked', () => {
    expect(classifyUnclaimableInvite({ ...open, expiredByDbClock: true })).toBe('expired')
    expect(classifyUnclaimableInvite({ ...open, expiredByDbClock: true, revokedAt: new Date() })).toBe('expired')
  })

  it('falls back to invalid_or_expired when nothing explains the miss', () => {
    expect(classifyUnclaimableInvite(open)).toBe('invalid_or_expired')
  })
})

describe('classifyGroupClaimMiss', () => {
  it('a vanished group is group_not_found', () => {
    expect(classifyGroupClaimMiss(null, 'user-a')).toBe('group_not_found')
  })

  it('a group that filled up is group_full', () => {
    expect(classifyGroupClaimMiss({ memberA: 'user-a', memberB: 'user-c' }, 'user-a')).toBe('group_full')
  })

  it('a solo group whose member_a is no longer the issuer is inviter_not_member', () => {
    expect(classifyGroupClaimMiss({ memberA: 'someone-else', memberB: null }, 'user-a')).toBe('inviter_not_member')
  })
})
