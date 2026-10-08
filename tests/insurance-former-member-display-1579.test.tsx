// #1579 — a member 被保人 who left the ledger is shown as 「前伴侶」 on the
// /assets card and the policy detail, never by their current name (which the
// server no longer sends). For a viewer pinned to a chapter of a group they
// left, the dropped person may be a stranger who joined later, so the field
// stays empty instead (`formerLabel: false`).
//
// Failure looks like: the 被保人 row goes blank for the couple (no label), or a
// pinned leaver sees 「前伴侶」 for someone who was never their partner.

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { toInsuranceDetailsView, memberLinkScope } from '@/lib/insuranceMemberLink'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/assets/ins-1',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useBaseCurrency: () => 'twd' as const,
  useMember: () => ({ viewer: { id: 'user-a', displayName: 'Me' }, partner: null, isPast: false, canAccessGuardian: true }),
}))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({ AddSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/actions/asset', () => ({ renewInsurance: vi.fn(), lapseInsurance: vi.fn() }))

import { InsuranceListItem } from '@/app/(dashboard)/assets/_components/InsuranceListItem'
import { InsuranceDetailClientLegacy } from '@/app/(dashboard)/assets/[id]/_components/InsuranceDetailClientLegacy'

const FORMER = zhTW.assets.insuranceList.policyHolderFormer
const i = zhTW.assets.insuranceList

function Wrapper({ children }: { children: ReactNode }) {
  return <TranslationsProvider value={zhTW} locale="zh-TW">{children}</TranslationsProvider>
}

const card = {
  insuranceType: 'medical', insured: null, insuredChildId: null, insuredChildName: null,
  insuredUserId: null, insuredUserDisplayName: null,
  policyHolderUserId: 'user-a', policyHolderDisplayName: 'Me', policyHolderAvatarUrl: null,
  insurer: 'Acme', annualPremium: 12000, sumInsured: null, startsAt: '2020-01-01', expiryDate: '2040-01-01',
  termYears: 20, payCycle: 'annual', reminderDaysBefore: 30, notes: null,
}

describe('/assets card (#1579)', () => {
  it('shows 保 前伴侶 for a former insured member', () => {
    render(<InsuranceListItem id="ins-1" name="醫療險" data={{ ...card, insuredIsFormer: true, formerLabel: true }} />, { wrapper: Wrapper })
    expect(screen.getByText(i.insuredShort.replace('{name}', FORMER))).toBeInTheDocument()
  })

  it('shows nothing for the insured when the label does not apply (pinned leaver)', () => {
    render(<InsuranceListItem id="ins-1" name="醫療險" data={{ ...card, insuredIsFormer: true, policyHolderIsFormer: true, formerLabel: false }} />, { wrapper: Wrapper })
    expect(screen.queryByText(FORMER, { exact: false })).toBeNull()
  })

  it('control: a current insured member is shown by name', () => {
    render(<InsuranceListItem id="ins-1" name="醫療險" data={{ ...card, insuredUserId: 'user-b', insuredUserDisplayName: 'Bea', formerLabel: true }} />, { wrapper: Wrapper })
    expect(screen.getByText(i.insuredShort.replace('{name}', 'Bea'))).toBeInTheDocument()
  })
})

const row = {
  policyNo: null, kind: 'medical', insured: null, insuredChildId: null, insuredChildName: null,
  insuredUserId: 'user-gone', insuredUserDisplayName: 'Gone Current Name', policyHolderUserId: 'user-gone',
  insurer: 'Acme', annualPremium: 12000, payCycle: 'annual', startsAt: '2020-01-01', endsAt: '2040-01-01',
  termYears: 20, sumInsured: null, vehicleId: null, expectedMaturityAmount: null, accountValue: null, currency: null,
}

describe('policy detail (#1579)', () => {
  const renderDetail = (labelFormer: boolean) => {
    const details = toInsuranceDetailsView(row, memberLinkScope(['user-a', null], 'user-a', labelFormer))
    return render(
      <InsuranceDetailClientLegacy
        assetId="ins-1" name="醫療險" notes={null} details={details}
        assetSheetInitial={{ id: 'ins-1', type: 'insurance', name: '醫療險', notes: null }}
      />,
      { wrapper: Wrapper },
    )
  }

  it('shows 前伴侶 as the 被保人, not their current name', () => {
    renderDetail(true)
    expect(screen.getByText(FORMER)).toBeInTheDocument()
    expect(screen.queryByText('Gone Current Name')).toBeNull()
  })

  it('shows neither for a pinned leaver', () => {
    renderDetail(false)
    expect(screen.queryByText(FORMER)).toBeNull()
    expect(screen.queryByText('Gone Current Name')).toBeNull()
  })
})
