import { describe, it, expect } from 'vitest'
import { deriveTxnFromPrimaryUser } from '@/lib/primaryUser'

const viewer = { id: 'viewer-id' }
const partner = { id: 'partner-id' }

describe('deriveTxnFromPrimaryUser', () => {
  it('solo mode (no partner) → always all_mine, paidBy=viewer regardless of primaryUserId', () => {
    expect(deriveTxnFromPrimaryUser(null, viewer, null)).toEqual({
      paidBy: 'viewer-id',
      splitType: 'all_mine',
    })
    expect(deriveTxnFromPrimaryUser(viewer.id, viewer, null)).toEqual({
      paidBy: 'viewer-id',
      splitType: 'all_mine',
    })
  })

  it('共用 (primaryUserId=NULL, partner exists) → half + paidBy=viewer', () => {
    expect(deriveTxnFromPrimaryUser(null, viewer, partner)).toEqual({
      paidBy: 'viewer-id',
      splitType: 'half',
    })
  })

  it('主要使用人是對方 → all_mine + paidBy=partner', () => {
    expect(deriveTxnFromPrimaryUser(partner.id, viewer, partner)).toEqual({
      paidBy: 'partner-id',
      splitType: 'all_mine',
    })
  })

  it('主要使用人是 viewer → all_mine + paidBy=viewer', () => {
    expect(deriveTxnFromPrimaryUser(viewer.id, viewer, partner)).toEqual({
      paidBy: 'viewer-id',
      splitType: 'all_mine',
    })
  })
})
