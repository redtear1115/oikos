import { describe, it, expect } from 'vitest'
import type { ComponentProps } from 'react'
import {
  insuredDisplayName,
  memberLinkScope,
  resolveInsuredMember,
  resolvePolicyHolder,
  toInsuranceDetailsView,
  type InsuranceDetailsView,
} from '@/lib/insuranceMemberLink'
import type { InsuranceDetailsRow } from '@/lib/db/queries/aibutsu'
import type { SavingsView } from '@/app/(dashboard)/assets/[id]/_components/insurance/SavingsView'
import type { InsuranceDetailClientLegacy } from '@/app/(dashboard)/assets/[id]/_components/InsuranceDetailClientLegacy'

// #1486 / #1579 — a 要保人 or member 被保人 who left the ledger is dropped
// server-side: no id, name or avatar reaches the client.
//
// Failure looks like nothing: no error — the card shows an ex-partner's current
// name, and their profile id rides along in the page payload.

const group = { memberA: 'user-a', memberB: 'user-b' }
const current = memberLinkScope([group.memberA, group.memberB], 'user-a', true)
const holder = (userId: string | null) => ({
  userId,
  displayName: userId ? 'Alex' : null,
  avatarUrl: userId ? 'https://img/alex.png' : null,
})

describe('resolvePolicyHolder (#1486)', () => {
  it('keeps name and avatar for a current member', () => {
    const r = resolvePolicyHolder(holder('user-b'), current)
    expect(r).toEqual({
      userId: 'user-b',
      displayName: 'Alex',
      avatarUrl: 'https://img/alex.png',
      isFormer: false,
    })
  })

  it('drops identity for a departed member', () => {
    const r = resolvePolicyHolder(holder('user-gone'), current)
    expect(r).toEqual({ userId: null, displayName: null, avatarUrl: null, isFormer: true })
    expect(JSON.stringify(r)).not.toContain('Alex')
    expect(JSON.stringify(r)).not.toContain('alex.png')
  })

  it('treats a solo ledger (no memberB) holder who left as former', () => {
    const solo = memberLinkScope(['user-a', null], 'user-a', true)
    expect(resolvePolicyHolder(holder('user-gone'), solo).isFormer).toBe(true)
  })

  it('still shows the viewer as themselves (leaver reading a closed chapter)', () => {
    const r = resolvePolicyHolder(holder('user-me'), memberLinkScope([group.memberA, group.memberB], 'user-me', true))
    expect(r.isFormer).toBe(false)
    expect(r.displayName).toBe('Alex')
  })

  it('does not flag a policy with no holder', () => {
    expect(resolvePolicyHolder(holder(null), current).isFormer).toBe(false)
  })
})

describe('memberLinkScope for a viewer pinned to a chapter of a group they left (#1579 F2)', () => {
  // Chapter 1 was B + C. C left; the group row today is B + D (D joined later).
  // C pins chapter 1: the allowed set is the CHAPTER's pair, and no label.
  const pinned = memberLinkScope(['user-b', 'user-c'], 'user-c', false)

  it('(c) a holder who is the NEW partner is dropped, with no 前伴侶 label', () => {
    const r = resolvePolicyHolder({ userId: 'user-d', displayName: 'Dana', avatarUrl: 'https://img/dana.png' }, pinned)
    expect(r).toEqual({ userId: null, displayName: null, avatarUrl: null, isFormer: true })
    expect(pinned.labelFormer).toBe(false)
    expect(insuredDisplayName(
      { insuredChildName: null, insuredUserDisplayName: null, insured: null, insuredIsFormer: true, formerLabel: pinned.labelFormer },
      '前伴侶',
    )).toBeNull()
  })

  it('(d) the viewer themself and the chapter partner are shown', () => {
    expect(resolvePolicyHolder(holder('user-c'), pinned).isFormer).toBe(false)
    expect(resolvePolicyHolder(holder('user-b'), pinned)).toMatchObject({ userId: 'user-b', displayName: 'Alex', isFormer: false })
  })

  it('an unreadable chapter row leaves only the viewer (fails closed)', () => {
    const closed = memberLinkScope([], 'user-c', false)
    expect(resolvePolicyHolder(holder('user-b'), closed).isFormer).toBe(true)
    expect(resolvePolicyHolder(holder('user-c'), closed).isFormer).toBe(false)
  })
})

describe('resolveInsuredMember (#1579)', () => {
  it('(a) a current member is unchanged', () => {
    expect(resolveInsuredMember({ userId: 'user-b', displayName: 'Bea' }, current))
      .toEqual({ userId: 'user-b', displayName: 'Bea', isFormer: false })
  })

  it('(b) a member who left is flagged, without id or name', () => {
    const r = resolveInsuredMember({ userId: 'user-gone', displayName: 'Gail' }, current)
    expect(r).toEqual({ userId: null, displayName: null, isFormer: true })
  })
})

const EX = '9f1c2d3e-0000-4000-8000-00000000e0e0'
const EX_NAME = 'Ex Partner Current Name'
const rawRow = (over: Partial<InsuranceDetailsRow> = {}): InsuranceDetailsRow => ({
  policyNo: 'PN-1',
  kind: 'savings',
  insured: null,
  insuredChildId: null,
  insuredChildName: null,
  insuredUserId: EX,
  insuredUserDisplayName: EX_NAME,
  policyHolderUserId: EX,
  insurer: 'Acme',
  annualPremium: 12000,
  payCycle: 'annual',
  startsAt: '2024-01-01',
  endsAt: '2044-01-01',
  termYears: 20,
  sumInsured: 1_000_000,
  vehicleId: null,
  expectedMaturityAmount: null,
  accountValue: null,
  currency: null,
  ...over,
})

describe('toInsuranceDetailsView (#1579)', () => {
  it('former holder AND former insured: no ex-member id or name anywhere, flags set', () => {
    const v = toInsuranceDetailsView(rawRow(), current)
    const wire = JSON.stringify(v)
    expect(wire).not.toContain(EX)
    expect(wire).not.toContain(EX_NAME)
    expect(v).toMatchObject({
      policyHolderUserId: null,
      insuredUserId: null,
      insuredUserDisplayName: null,
      policyHolderIsFormer: true,
      insuredIsFormer: true,
      formerLabel: true,
    })
    expect(insuredDisplayName(v, '前伴侶')).toBe('前伴侶')
  })

  it('current-member row is unchanged apart from the false flags', () => {
    const row = rawRow({ policyHolderUserId: 'user-b', insuredUserId: 'user-a', insuredUserDisplayName: 'Me' })
    expect(toInsuranceDetailsView(row, current)).toEqual({
      ...row,
      policyHolderIsFormer: false,
      insuredIsFormer: false,
      formerLabel: true,
    })
  })

  it('legacy NULL holder is not former', () => {
    const v = toInsuranceDetailsView(rawRow({ policyHolderUserId: null, insuredUserId: null, insuredUserDisplayName: null, insured: 'Grandma' }), current)
    expect(v.policyHolderIsFormer).toBe(false)
    expect(v.insuredIsFormer).toBe(false)
    expect(insuredDisplayName(v, '前伴侶')).toBe('Grandma')
  })
})

// #1579 F3 — the detail components only take the sanitised view. These lines
// are type-checked by `npx tsc --noEmit`: if the raw row ever becomes
// assignable, the @ts-expect-error directives turn into errors.
describe('detail components reject the raw row at the type level (#1579 F3)', () => {
  it('compiles only with InsuranceDetailsView', () => {
    const raw: InsuranceDetailsRow = rawRow()
    // @ts-expect-error — raw row is not a SavingsView `details`
    const toSavings: ComponentProps<typeof SavingsView>['details'] = raw
    // @ts-expect-error — raw row is not an InsuranceDetailClientLegacy `details`
    const toLegacy: ComponentProps<typeof InsuranceDetailClientLegacy>['details'] = raw
    const ok: InsuranceDetailsView = toInsuranceDetailsView(raw, current)
    const okSavings: ComponentProps<typeof SavingsView>['details'] = ok
    expect([toSavings, toLegacy, okSavings]).toHaveLength(3)
  })
})
