// #1600 — each insurance policy records its own currency.
//
// Failure looks like: a USD policy printed as NT$, a TWD ledger's 已繳 divided
// by a USD 預估滿期金 into a bar at 3% with an "over target" nudge, a prefilled
// 滿期金 that is the policy's USD number typed into a TWD ledger, or an edit of
// an unrelated field resetting the stored currency to the ledger's.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { validateInsuranceInput } from '@/lib/validators'
import { policyCurrency, sameCurrency, sumPremiumByCurrency } from '@/lib/insuranceCurrency'
import type { CurrencyCode } from '@/lib/currency'

let base: CurrencyCode = 'twd'
const VIEWER = { id: 'a0a0a0a0-0000-4000-8000-0000000000a0', displayName: 'Me' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/assets',
  useSearchParams: () => new URLSearchParams('tab=guardian'),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useBaseCurrency: () => base,
  useMember: () => ({ viewer: VIEWER, partner: null, isPast: false, canAccessGuardian: true }),
}))
vi.mock('@/app/(dashboard)/_components/RealtimeProvider', () => ({ useRealtimeEvents: () => {} }))
vi.mock('@/app/(dashboard)/_components/TodayProvider', () => ({ useToday: () => '2030-06-15' }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({ TransactionFeed: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({ AddSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/app/(dashboard)/_components/RecurringRuleSheet', () => ({ RecurringRuleSheet: () => null }))
const incomeSheetProps: { prefilledAmount?: number }[] = []
vi.mock('@/app/(dashboard)/dashboard/_components/IncomeSheet', () => ({
  IncomeSheet: (p: { open: boolean; prefilledAmount?: number }) => { if (p.open) incomeSheetProps.push({ prefilledAmount: p.prefilledAmount }); return null },
}))
vi.mock('@/actions/transaction', () => ({ loadMoreTransactionsForAsset: vi.fn() }))
vi.mock('@/actions/income', () => ({ loadMoreInsuranceReturns: vi.fn() }))
const editInsurance = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, data: undefined }))
const createInsurance = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, data: { id: 'new' } }))
vi.mock('@/actions/asset', () => ({
  createInsurance: (...a: unknown[]) => createInsurance(...a),
  editInsurance: (...a: unknown[]) => editInsurance(...a),
  getCarAssets: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  getChildAssets: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  softDeleteAsset: vi.fn(),
  renewInsurance: vi.fn(),
  lapseInsurance: vi.fn(),
}))

import { InsuranceListItem } from '@/app/(dashboard)/assets/_components/InsuranceListItem'
import { AssetsListClient, type AssetsListItem } from '@/app/(dashboard)/assets/_components/AssetsListClient'
import { SavingsView } from '@/app/(dashboard)/assets/[id]/_components/insurance/SavingsView'
import { InsuranceDetailClientLegacy } from '@/app/(dashboard)/assets/[id]/_components/InsuranceDetailClientLegacy'
import { InsuranceSheetBody, type InsuranceInitial } from '@/app/(dashboard)/assets/_components/AssetSheet/InsuranceSheetBody'
import { toInsuranceDetailsView, memberLinkScope } from '@/lib/insuranceMemberLink'

function Wrapper({ children }: { children: ReactNode }) {
  return <TranslationsProvider value={zhTW} locale="zh-TW">{children}</TranslationsProvider>
}

beforeEach(() => {
  base = 'twd'
  incomeSheetProps.length = 0
  editInsurance.mockClear()
  createInsurance.mockClear()
})

describe('validateInsuranceInput currency (#1600)', () => {
  it('accepts each ledger currency, case-insensitively', () => {
    expect(validateInsuranceInput({ name: 'x', currency: 'usd' }).currency).toBe('usd')
    expect(validateInsuranceInput({ name: 'x', currency: 'JPY' }).currency).toBe('jpy')
  })
  it('omitted or null currency stays null (edit keeps stored, create uses the ledger)', () => {
    expect(validateInsuranceInput({ name: 'x' }).currency).toBeNull()
    expect(validateInsuranceInput({ name: 'x', currency: null }).currency).toBeNull()
  })
  it('rejects an unknown or empty code', () => {
    expect(() => validateInsuranceInput({ name: 'x', currency: 'eur' })).toThrow()
    expect(() => validateInsuranceInput({ name: 'x', currency: '' })).toThrow()
  })
})

describe('policyCurrency / sameCurrency / sumPremiumByCurrency (#1600)', () => {
  it('NULL reads as the ledger base', () => {
    expect(policyCurrency(null, 'usd')).toBe('usd')
    expect(sameCurrency(null, 'twd')).toBe(true)
    expect(sameCurrency('usd', 'twd')).toBe(false)
  })
  it('single currency: one entry, base first, 0 for no policies', () => {
    expect(sumPremiumByCurrency([], 'twd')).toEqual([{ currency: 'twd', total: 0 }])
    expect(sumPremiumByCurrency([{ annualPremium: 1200, currency: 'usd' }], 'twd')).toEqual([{ currency: 'usd', total: 1200 }])
    expect(sumPremiumByCurrency([{ annualPremium: 10, currency: null }, { annualPremium: 5, currency: 'twd' }], 'twd'))
      .toEqual([{ currency: 'twd', total: 15 }])
  })
  it('mixed currencies are never added together', () => {
    expect(sumPremiumByCurrency([
      { annualPremium: 30000, currency: 'twd' },
      { annualPremium: 1200, currency: 'usd' },
      { annualPremium: 800, currency: 'usd' },
      { annualPremium: null, currency: null },
    ], 'twd')).toEqual([{ currency: 'twd', total: 30000 }, { currency: 'usd', total: 2000 }])
  })
})

const card = {
  insuranceType: 'life', insured: null, insuredChildId: null, insuredChildName: null,
  insuredUserId: null, insuredUserDisplayName: null,
  policyHolderUserId: VIEWER.id, policyHolderDisplayName: 'Me', policyHolderAvatarUrl: null,
  insurer: 'Acme', annualPremium: 30000, sumInsured: 5000000, startsAt: '2030-01-01', expiryDate: '2050-01-01',
  termYears: 20, payCycle: 'annual', reminderDaysBefore: 30, notes: null,
}

describe('InsuranceListItem (#1600)', () => {
  it('a USD policy in a TWD ledger shows $, not NT$', () => {
    render(<InsuranceListItem id="p" name="A" data={{ ...card, currency: 'usd' }} />, { wrapper: Wrapper })
    expect(screen.getByText('$ 30,000')).toBeInTheDocument()
    expect(screen.queryByText(/NT\$/)).toBeNull()
  })
  it('a TWD policy shows NT$ (byte-identical to before)', () => {
    render(<InsuranceListItem id="p" name="A" data={{ ...card, currency: 'twd' }} />, { wrapper: Wrapper })
    expect(screen.getByText('NT$ 30,000')).toBeInTheDocument()
  })
  it('a NULL-currency policy renders in the ledger currency', () => {
    base = 'usd'
    render(<InsuranceListItem id="p" name="A" data={{ ...card, currency: null }} />, { wrapper: Wrapper })
    expect(screen.getByText('$ 30,000')).toBeInTheDocument()
  })
})

const item = (id: string, premium: number, currency: CurrencyCode | null): AssetsListItem => ({
  id, type: 'insurance', name: `P${id}`, hasPlate: false, monthAmount: 0, totalAmount: 0,
  insurance: { ...card, currency, annualPremium: premium },
} as AssetsListItem)

describe('AssetsListClient total annual premium (#1600)', () => {
  it('same currency: one amount, as before', () => {
    render(<AssetsListClient items={[item('1', 30000, 'twd'), item('2', 10000, null)]} isPast={false} />, { wrapper: Wrapper })
    expect(screen.getByText('NT$ 40,000')).toBeInTheDocument()
  })
  it('mixed currencies: one amount per currency, not summed', () => {
    render(<AssetsListClient items={[item('1', 30000, 'twd'), item('2', 1200, 'usd')]} isPast={false} />, { wrapper: Wrapper })
    expect(screen.getByText('NT$ 30,000 · $ 1,200')).toBeInTheDocument()
  })
})

const raw = (over: Record<string, unknown> = {}) => ({
  policyNo: null, kind: 'savings', insured: null, insuredChildId: null, insuredChildName: null,
  insuredUserId: null, insuredUserDisplayName: null, policyHolderUserId: VIEWER.id, insurer: 'Acme',
  annualPremium: 1000, payCycle: 'annual', startsAt: '2010-01-01', endsAt: '2020-01-01',
  termYears: 10, sumInsured: null, vehicleId: null, expectedMaturityAmount: 12000, accountValue: 9000,
  currency: null as CurrencyCode | null, ...over,
})
const savingsView = (over: Record<string, unknown> = {}) => {
  const details = toInsuranceDetailsView(raw(over), memberLinkScope([VIEWER.id, null], VIEWER.id, true))
  return render(
    <SavingsView
      assetId="a1" name="儲蓄險" notes={null} details={details}
      premiumStats={{ total: 10000, count: 10 }} returnStats={{ total: 100, count: 1 }}
      returnBreakdown={{}} initialPremiumTxns={[]} initialReturns={[]} pageSize={20}
      assetSheetInitial={{ id: 'a1', type: 'insurance', name: '儲蓄險', notes: null }}
      recurringRules={[]}
    />,
    { wrapper: Wrapper },
  )
}
const ts = zhTW.assetDetail.savings

describe('SavingsView across currencies (#1600)', () => {
  it('USD policy in a TWD ledger: policy figures in $, ledger totals in NT$, no bars, no matured prompt', () => {
    savingsView({ currency: 'usd' })
    expect(screen.getByText('$ 9,000')).toBeInTheDocument()      // account value
    expect(screen.getByText('$ 12,000')).toBeInTheDocument()     // expected maturity
    expect(screen.getByText('NT$ 10,000')).toBeInTheDocument()   // ledger paid
    expect(screen.getByText('NT$ 100')).toBeInTheDocument()      // ledger returned
    expect(screen.getByText(ts.crossCurrencyNote.replace('{policy}', 'USD').replace('{base}', 'TWD'))).toBeInTheDocument()
    expect(screen.queryByText(ts.heroLabelIn)).toBeNull()
    expect(screen.queryByText(/%$/)).toBeNull()
    expect(screen.queryByText(ts.maturedAwaitingCta)).toBeNull()
    expect(screen.queryByText(ts.heroAwaitingMaturity)).toBeNull()
  })

  it('record-return CTA stays, and opens the sheet WITHOUT a prefilled amount', () => {
    savingsView({ currency: 'usd' })
    fireEvent.click(screen.getByRole('button', { name: ts.addReturn }))
    expect(incomeSheetProps.at(-1)).toEqual({ prefilledAmount: undefined })
  })

  it('same currency (NULL = ledger): matured prompt shows and prefills the expected maturity', () => {
    savingsView({ currency: null })
    expect(screen.getByText(ts.maturedAwaitingCta)).toBeInTheDocument()
    fireEvent.click(screen.getByText(ts.maturedAwaitingCta))
    expect(incomeSheetProps.at(-1)).toEqual({ prefilledAmount: 12000 })
  })

  it('same currency: hero keeps its bars; explicit twd identical to NULL', () => {
    const a = savingsView({ currency: null }).container.innerHTML
    const b = savingsView({ currency: 'twd' }).container.innerHTML
    expect(b).toBe(a)
  })
})

describe('InsuranceDetailClientLegacy (#1600)', () => {
  it('USD policy shows $ for the big number and the sum insured line', () => {
    const details = toInsuranceDetailsView(
      raw({ kind: 'medical', annualPremium: 1200, termYears: 5, sumInsured: 100000, startsAt: null, endsAt: null, currency: 'usd' }),
      memberLinkScope([VIEWER.id, null], VIEWER.id, true),
    )
    render(
      <InsuranceDetailClientLegacy assetId="a" name="n" notes={null} details={details}
        assetSheetInitial={{ id: 'a', type: 'insurance', name: 'n', notes: null }} />,
      { wrapper: Wrapper },
    )
    expect(screen.getByText('$')).toBeInTheDocument()
    expect(screen.getByText(zhTW.assetDetail.insurance.termAndSumLine.replace('{n}', '5').replace('{sum}', '$ 100,000'))).toBeInTheDocument()
    expect(screen.queryByText('NT$')).toBeNull()
  })
})

const initial: InsuranceInitial = {
  id: 'ins-1', name: '保單', notes: null, insKind: 'medical', insInsured: null, insInsuredChildId: null,
  insInsuredUserId: VIEWER.id, insPolicyHolderUserId: VIEWER.id, insInsurer: 'Acme', insPolicyNo: null,
  insAnnualPremium: 1200, insSumInsured: null, insPayCycle: 'annual', insStartsAt: null, insEndsAt: null,
  insTermYears: null, insVehicleId: null, insExpectedMaturityAmount: null, insAccountValue: null,
}
const picker = () => screen.getByRole('combobox', { name: zhTW.assetSheet.insurance.currency }) as HTMLSelectElement

describe('InsuranceSheetBody currency picker (#1600)', () => {
  it('edit of a USD policy in a TWD ledger: picker shows USD; saving only a rename sends usd', async () => {
    render(<InsuranceSheetBody open onClose={() => {}} initial={{ ...initial, insCurrency: 'usd' }} />, { wrapper: Wrapper })
    expect(picker().value).toBe('USD')
    expect(screen.getAllByText('$').length).toBeGreaterThan(0)
    fireEvent.change(screen.getByDisplayValue('保單'), { target: { value: '保單改名' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.assetSheet.saveChanges }))
    await waitFor(() => expect(editInsurance).toHaveBeenCalled())
    expect(editInsurance.mock.calls[0][0]).toMatchObject({ id: 'ins-1', name: '保單改名', currency: 'usd' })
  })

  it('edit of a NULL-currency policy shows the ledger currency', () => {
    base = 'jpy'
    render(<InsuranceSheetBody open onClose={() => {}} initial={{ ...initial, insCurrency: null }} />, { wrapper: Wrapper })
    expect(picker().value).toBe('JPY')
  })

  it('create defaults to the ledger currency and sends the picked one', async () => {
    base = 'usd'
    render(<InsuranceSheetBody open onClose={() => {}} />, { wrapper: Wrapper })
    expect(picker().value).toBe('USD')
    fireEvent.change(picker(), { target: { value: 'TWD' } })
    fireEvent.change(screen.getByPlaceholderText(zhTW.assetSheet.name.placeholderInsurance), { target: { value: '新保單' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.assetSheet.titleNew }))
    await waitFor(() => expect(createInsurance).toHaveBeenCalled())
    expect(createInsurance.mock.calls[0][0]).toMatchObject({ name: '新保單', currency: 'twd' })
  })
})
