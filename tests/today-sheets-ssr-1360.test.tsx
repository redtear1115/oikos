// #1360 — the sheets seed their date field with `useState(localTodayISO())`.
// SheetFrame keeps a closed sheet mounted (translated off-screen, `inert`),
// so the question is whether that seeded date reaches the server HTML of a
// *closed* sheet, and whether hydrating it in another zone then mismatches.
//
// Measured, not assumed: each sheet is server-rendered closed with TZ = UTC
// at 2026-09-20T23:30Z (UTC day 20, Taipei day 21) and hydrated with TZ =
// Asia/Taipei, and React's recoverable hydration errors are counted.
//
// Measured on main before the fix (and the reason each sheet is here):
//   AddSheet, IncomeSheet, SettlementSheet — the date reaches the HTML as
//     text (DateField / the picker's 今天-or-weekday subtitle): 1 error each.
//     Dashboard and RecordsList mount them unconditionally, so this fired on
//     the first screen. Fixed by seeding from useToday().
//   RecurringRuleSheet — the date is only an <input type="date" value>
//     attribute; React corrects it to the device's date on hydration without
//     an error. Left as is; kept here as a guard.
//   SettlementForm — not tested: BalanceHero mounts it only after a click
//     (`settleOpen && canSettle`, initial false), so it is never in SSR HTML.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { I18nWrapper } from './_mocks/i18n'
import { TodayProvider } from '@/app/(dashboard)/_components/TodayProvider'
import { todayYMDIn } from '@/lib/today'

vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u-1', initial: 'R', avatarUrl: null, defaultSplitType: 'half' },
    partner: { id: 'u-2', initial: 'S', avatarUrl: null },
    isSolo: false,
    isPast: false,
    viewerIsA: true,
    canAccessGuardian: false,
  }),
  whoToMemberRole: (w: 'M' | 'T') => (w === 'M' ? 'a' : 'b'),
}))
vi.mock('@/actions/transaction', () => ({
  createTransaction: vi.fn(),
  editTransaction: vi.fn(),
  softDeleteTransaction: vi.fn(),
  getDescriptionSuggestions: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/actions/tripExpense', () => ({
  createTripExpense: vi.fn(),
  editTripExpense: vi.fn(),
  softDeleteTripExpense: vi.fn(),
}))
vi.mock('@/actions/recurringExpense', () => ({
  editAndConfirmPending: vi.fn(),
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
}))
vi.mock('@/actions/recurringIncome', () => ({
  editAndConfirmPending: vi.fn(),
  createRule: vi.fn(), updateRule: vi.fn(), pauseRule: vi.fn(), resumeRule: vi.fn(), softDeleteRule: vi.fn(),
}))
vi.mock('@/actions/income', () => ({
  createIncome: vi.fn(),
  editIncome: vi.fn(),
  softDeleteIncome: vi.fn(),
  getInsuranceAssets: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/actions/settlement', () => ({
  createSettlement: vi.fn(),
  editSettlement: vi.fn(),
  softDeleteSettlement: vi.fn(),
}))
vi.mock('@/actions/asset', () => ({
  loadAssetsForPicker: vi.fn(() => new Promise(() => {})),
  getCarAssets: vi.fn(() => new Promise(() => {})),
  getChildAssets: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/actions/trip', () => ({ endTrip: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}))

import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { IncomeSheet } from '@/app/(dashboard)/dashboard/_components/IncomeSheet'
import { SettlementSheet } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { RecurringRuleSheet } from '@/app/(dashboard)/_components/RecurringRuleSheet'

const INSTANT = new Date('2026-09-20T23:30:00Z')
const originalTZ = process.env.TZ

beforeEach(() => {
  // jsdom has no ResizeObserver; the sheets only use it for layout.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(INSTANT)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  process.env.TZ = originalTZ
  document.body.innerHTML = ''
})

async function measure(node: ReactNode, deviceTZ = 'Asia/Taipei') {
  process.env.TZ = 'UTC'
  // Seeded the way the dashboard layout seeds it: today in the cookie zone.
  const tree = (
    <I18nWrapper>
      <TodayProvider todayYMD={todayYMDIn(deviceTZ)}>{node}</TodayProvider>
    </I18nWrapper>
  )
  const html = renderToString(tree)
  process.env.TZ = deviceTZ
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const errors: unknown[] = []
  await act(async () => {
    hydrateRoot(container, tree, { onRecoverableError: (e) => errors.push(e) })
  })
  return {
    // The closed sheet's seeded date, in any form it might be printed:
    // ISO (input value), or zh-TW / en-style month-day text.
    utcDateInHtml: /2026-09-20|9月20日|Sep(tember)? 20/.test(html),
    errors: errors.length,
  }
}

const noop = () => {}

describe('closed sheets across the UTC → Taipei boundary (#1360)', () => {
  it.each([
    ['AddSheet', <AddSheet key="a" open={false} onClose={noop} />],
    ['IncomeSheet', <IncomeSheet key="i" open={false} onClose={noop} />],
    ['SettlementSheet', <SettlementSheet key="s" open={false} onClose={noop} initial={null} />],
    ['RecurringRuleSheet (expense)', <RecurringRuleSheet key="re" type="expense" open={false} onClose={noop} onMutated={noop} />],
    ['RecurringRuleSheet (income)', <RecurringRuleSheet key="ri" type="income" open={false} onClose={noop} onMutated={noop} insuranceAssets={[]} />],
  ])('%s', async (_name, node) => {
    // Control: same zone on both sides must hydrate cleanly, so any error
    // below is the zone boundary and not some other nondeterminism.
    expect((await measure(node, 'UTC')).errors).toBe(0)
    document.body.innerHTML = ''
    const r = await measure(node)
    expect(r.errors).toBe(0)
  })
})
