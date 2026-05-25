import { describe, it, expect } from 'vitest'
import { defaultFilter, type TxnFilter } from '@/lib/filter'
import {
  resolveTxnFilter,
  resolveIncomeFilter,
  NO_PARTNER_SENTINEL,
} from '@/lib/resolveTxnFilter'

const VIEWER = 'viewer-id'
const PARTNER = 'partner-id'
// Viewer is member A; partner is member B.
const PAIR = { memberA: VIEWER, memberB: PARTNER }
// Viewer is member B; partner (member A) is someone else.
const PAIR_VIEWER_IS_B = { memberA: PARTNER, memberB: VIEWER }
const SOLO = { memberA: VIEWER, memberB: null }

function filter(patch: Partial<TxnFilter>): TxnFilter {
  return { ...defaultFilter(), ...patch }
}

describe('resolveTxnFilter — paidBy resolution', () => {
  it('payer "all" → paidBy null', () => {
    expect(resolveTxnFilter(filter({ payer: 'all' }), VIEWER, PAIR).paidBy).toBeNull()
  })
  it('payer "mine" → viewer id', () => {
    expect(resolveTxnFilter(filter({ payer: 'mine' }), VIEWER, PAIR).paidBy).toBe(VIEWER)
  })
  it('payer "theirs" → partner id (viewer is member A)', () => {
    expect(resolveTxnFilter(filter({ payer: 'theirs' }), VIEWER, PAIR).paidBy).toBe(PARTNER)
  })
  it('payer "theirs" → partner id (viewer is member B)', () => {
    expect(resolveTxnFilter(filter({ payer: 'theirs' }), VIEWER, PAIR_VIEWER_IS_B).paidBy).toBe(PARTNER)
  })
  it('payer "theirs" with no partner (solo) → sentinel uuid', () => {
    expect(resolveTxnFilter(filter({ payer: 'theirs' }), VIEWER, SOLO).paidBy).toBe(NO_PARTNER_SENTINEL)
  })
})

describe('resolveTxnFilter — dimension mapping', () => {
  it('maps burden side + viewer/partner ids', () => {
    const r = resolveTxnFilter(filter({ burden: 'mine' }), VIEWER, PAIR)
    expect(r.burden).toEqual({ side: 'mine', viewerId: VIEWER, partnerId: PARTNER })
  })
  it('burden "all" → null', () => {
    expect(resolveTxnFilter(filter({ burden: 'all' }), VIEWER, PAIR).burden).toBeNull()
  })
  it('status "all" → null; concrete status passes through', () => {
    expect(resolveTxnFilter(filter({ status: 'all' }), VIEWER, PAIR).status).toBeNull()
    expect(resolveTxnFilter(filter({ status: 'pending' }), VIEWER, PAIR).status).toBe('pending')
  })
  it('flattens category/asset sets to arrays', () => {
    const r = resolveTxnFilter(
      filter({ categories: new Set(['dining']), assetIds: new Set(['a1']) }),
      VIEWER,
      PAIR,
    )
    expect(r.categories).toEqual(['dining'])
    expect(r.assetIds).toEqual(['a1'])
  })
})

describe('resolveIncomeFilter', () => {
  it('recipientId mirrors paidBy resolution', () => {
    expect(resolveIncomeFilter(filter({ payer: 'theirs' }), VIEWER, PAIR).recipientId).toBe(PARTNER)
    expect(resolveIncomeFilter(filter({ payer: 'mine' }), VIEWER, PAIR).recipientId).toBe(VIEWER)
  })
  it('carries income categories + amount bounds', () => {
    const r = resolveIncomeFilter(
      filter({ incomeCategories: new Set(['salary']), amountMin: 100, amountMax: 500 }),
      VIEWER,
      PAIR,
    )
    expect(r.incomeCategories).toEqual(['salary'])
    expect(r.amountMin).toBe(100)
    expect(r.amountMax).toBe(500)
  })
})
