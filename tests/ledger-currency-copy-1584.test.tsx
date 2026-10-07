import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

// #1584 — the remaining hard-coded `NT$` (sheet symbols, toast / recap copy,
// my-share line) follows the ledger base currency. TWD output must stay
// byte-identical to what shipped before.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/actions/settlement', () => ({ createSettlement: vi.fn() }))
vi.mock('@/actions/recurringExpense', () => ({
  confirmPending: vi.fn(), skipPending: vi.fn(), editAndConfirmPending: vi.fn(),
}))

import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { SettlementForm } from '@/app/(dashboard)/dashboard/_components/SettlementForm'
import { PendingCard } from '@/app/(dashboard)/dashboard/_components/PendingCard'
import { CardCategory } from '@/app/(dashboard)/review/[month]/_components/CardCategory'
import { CardLargest } from '@/app/(dashboard)/review/[month]/_components/CardLargest'
import { CardRecurring } from '@/app/(dashboard)/review/[month]/_components/CardRecurring'
import { CardAssets } from '@/app/(dashboard)/review/[month]/_components/CardAssets'
import { MaturedAwaitingPrompt } from '@/app/(dashboard)/assets/[id]/_components/insurance/MaturedAwaitingPrompt'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import { formatLedgerAmount, type CurrencyCode } from '@/lib/currency'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import type { MonthlyReviewSnapshotRow } from '@/lib/db/queries/monthlyReview'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}
})
afterAll(() => { vi.unstubAllGlobals() })

function member(baseCurrency: CurrencyCode): MemberContextValue {
  return {
    group: { id: 'g1', name: 'G', baseCurrency },
    viewer: { id: 'viewer-1', initial: 'V', displayName: 'Viewer', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
    partner: { id: 'partner-1', initial: 'P', displayName: 'Partner', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
    viewerIsA: true, isSolo: false, isPast: false, canAccessGuardian: false,
    epochStartedAt: '2026-01-01', epochEndedAt: null,
  }
}
const wrap = (base: CurrencyCode, ui: React.ReactElement) =>
  render(<I18nWrapper><MemberProvider value={member(base)}>{ui}</MemberProvider></I18nWrapper>)

const snapshot = {
  id: 's', groupId: 'g1', year: 2026, month: 9, computedAt: new Date(),
  topCategory: 'dining', topCategoryTotal: 12345,
  largestExpenseAmount: 6789, largestExpenseDescription: '晚餐', largestExpenseCategory: 'dining',
  largestExpensePaidByName: 'Ray',
  recurringEvents: [{ name: '房租', amount: 2000, direction: 'expense', occurredAt: '2026-09-01' }], recurringTotalIncome: 1000, recurringTotalExpense: 2000,
  assetBreakdown: [{ assetName: '小白', total: 4500 }],
  bannerDismissedByMemberAAt: null, bannerDismissedByMemberBAt: null,
} as unknown as MonthlyReviewSnapshotRow

describe('recap cards', () => {
  it('TWD unchanged: NT$ <space> digits in the headline and the body', () => {
    const cat = wrap('twd', <CardCategory snapshot={snapshot} isSolo={false} />)
    expect(cat.container.textContent).toContain('NT$ 12,345')
    expect(cat.container.textContent).toContain('共 NT$ 12,345')
    cat.unmount()
    const big = wrap('twd', <CardLargest snapshot={snapshot} />)
    expect(big.container.textContent).toContain('NT$ 6,789')
    expect(big.container.textContent).toContain('「晚餐」，NT$ 6,789')
    big.unmount()
    const rec = wrap('twd', <CardRecurring snapshot={snapshot} />)
    expect(rec.container.textContent).toContain('NT$ 1,000')
    expect(rec.container.textContent).toContain('NT$ 2,000')
    rec.unmount()
    const assets = wrap('twd', <CardAssets snapshot={snapshot} />)
    expect(assets.container.textContent).toContain('NT$ 4,500')
  })

  it('USD base: $ in headline and body, never NT$', () => {
    for (const ui of [
      <CardCategory key="c" snapshot={snapshot} isSolo={false} />,
      <CardLargest key="l" snapshot={snapshot} />,
      <CardRecurring key="r" snapshot={snapshot} />,
      <CardAssets key="a" snapshot={snapshot} />,
    ]) {
      const v = wrap('usd', ui)
      expect(v.container.textContent).toContain('$ ')
      expect(v.container.textContent).not.toContain('NT$')
      v.unmount()
    }
    const cat = wrap('usd', <CardCategory snapshot={snapshot} isSolo={false} />)
    expect(cat.container.textContent).toContain('共 $ 12,345')
  })
})

describe('CompactRow my-share line', () => {
  const tx = {
    id: 'tx-1', amount: 1440, splitType: 'all_mine' as const, splitRatioA: null,
    description: 'x', category: 'dining', paidBy: 'viewer-1', transactedAt: '2026-05-01',
    kind: 'transaction' as const,
  }
  it('TWD keeps the compact $ prefix; USD base shows $; JPY base shows ¥', () => {
    const twd = wrap('twd', <CompactRow tx={tx} isLast />)
    expect(twd.container.textContent).toContain('NT$1,440')
    expect(twd.container.textContent).toContain('$1,440')
    twd.unmount()
    const usd = wrap('usd', <CompactRow tx={{ ...tx, amount: 45 }} isLast />)
    expect(usd.container.textContent).toContain('$45')
    expect(usd.container.textContent).not.toContain('NT$')
    usd.unmount()
    const jpy = wrap('jpy', <CompactRow tx={{ ...tx, amount: 900 }} isLast />)
    expect(jpy.container.textContent).toContain('¥900')
    expect(jpy.container.textContent).not.toContain('NT$')
  })
})

describe('sheet symbol and pending card', () => {
  const form = (base: CurrencyCode) => wrap(base, (
    <SettlementForm debtAmount={500} viewerIsDebtor onClose={() => {}} onMutated={() => {}} />
  ))
  it('SettlementForm symbol follows the base currency', () => {
    const twd = form('twd')
    expect(twd.container.textContent).toContain('NT$')
    twd.unmount()
    const usd = form('usd')
    expect(usd.container.textContent).not.toContain('NT$')
    expect(usd.container.textContent).toContain('$')
  })

  const card = (base: CurrencyCode) => wrap(base, (
    <PendingCard
      cat={{ tint: '#fff', ink: '#000', mono: 'x' }} gradientAlpha="45" title="房租" date="2026-10-01"
      amount={12000} confirmLabel="ok" editLabel="edit" skipLabel="skip"
      primaryDisabledClass="" secondaryDisabledClass=""
      onConfirm={vi.fn()} onSkip={vi.fn()}
      confirmErrorFallback="e" skipErrorFallback="e" skipModalTitle="t"
    />
  ))
  it('PendingCard amount keeps "symbol space digits"', () => {
    const twd = card('twd')
    expect(twd.container.textContent).toContain('NT$ 12,000')
    twd.unmount()
    const usd = card('usd')
    expect(usd.container.textContent).toContain('$ 12,000')
    expect(usd.container.textContent).not.toContain('NT$')
  })
})

describe('MaturedAwaitingPrompt', () => {
  const view = (base: CurrencyCode) => wrap(base, (
    <MaturedAwaitingPrompt maturityDate="2026-10-01" expectedMaturity={100000} premiumTotal={80000} premiumCount={8} onConfirm={() => {}} />
  ))
  it('TWD unchanged; USD base never NT$', () => {
    const twd = view('twd')
    expect(twd.container.textContent).toContain('NT$')
    expect(twd.container.textContent).toContain('累計繳 NT$ 80,000 已記入 8 筆')
    twd.unmount()
    const usd = view('usd')
    expect(usd.container.textContent).toContain('累計繳 $ 80,000 已記入 8 筆')
    expect(usd.container.textContent).not.toContain('NT$')
  })
})

describe('toast / balance copy', () => {
  const { recorded, updated } = zhTW.common.toast
  it('TWD toast is byte-identical to the old baked-in string', () => {
    expect(recorded.replace('{amount}', formatLedgerAmount(1200, 'twd'))).toBe('已記錄 NT$1,200')
    expect(updated.replace('{amount}', formatLedgerAmount(1200, 'twd'))).toBe('已更新 NT$1,200')
  })
  it('USD toast shows $45', () => {
    expect(recorded.replace('{amount}', formatLedgerAmount(45, 'usd'))).toBe('已記錄 $45')
    expect(en.common.toast.recorded.replace('{amount}', formatLedgerAmount(45, 'usd'))).toBe('Recorded $45')
  })
})

// Every locale must carry the same placeholders for each key this issue
// touched; a drifted placeholder renders literally ("{amoutn}") with no error.
describe('locale placeholder parity', () => {
  const locales = { 'zh-TW': zhTW, 'zh-CN': zhCN, en, ja } as unknown as Record<string, unknown>
  const paths = [
    'common.toast.recorded', 'common.toast.updated',
    'monthlyReview.card1Body', 'monthlyReview.card1BodySolo', 'monthlyReview.card2Body',
    'monthlyReview.card3ExpenseTotal', 'monthlyReview.card3IncomeTotal',
    'assetDetail.savings.heroMatured', 'assetDetail.savings.heroNoExpectedBar',
    'assetDetail.savings.maturedAwaitingPremiumNote',
  ]
  const get = (o: unknown, p: string) =>
    p.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o) as string | undefined
  const holders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

  it.each(paths)('%s has identical placeholders in all 4 locales and no baked-in NT$', (path) => {
    const base = get(locales['zh-TW'], path)
    expect(typeof base).toBe('string')
    for (const [name, loc] of Object.entries(locales)) {
      const v = get(loc, path)
      expect(typeof v, `${name} ${path}`).toBe('string')
      expect(holders(v!), `${name} ${path}`).toBe(holders(base!))
      expect(v, `${name} ${path}`).not.toContain('NT$')
    }
  })

  it('balanceNotZero (leave flow) is in sync too', () => {
    const find = (loc: unknown): string => {
      const hit: string[] = []
      const walk = (o: unknown) => { for (const [k, v] of Object.entries((o ?? {}) as Record<string, unknown>)) {
        if (k === 'balanceNotZero' && typeof v === 'string' && v.includes('{amount}')) hit.push(v)
        else if (v && typeof v === 'object') walk(v)
      } }
      walk(loc)
      return hit[0]
    }
    const base = find(zhTW)
    expect(base).toBeTruthy()
    for (const loc of Object.values(locales)) {
      const v = find(loc)
      expect(holders(v)).toBe('{amount}')
      expect(v).not.toContain('NT$')
    }
  })
})
