import { describe, it, expect, vi } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─── #1604 part 1 — a past chapter is labelled with THAT chapter's partner ───
//
// After a leave, the group row names the stayer and whoever came next (or
// nobody); the closed chapter's GroupEpochs row still names the ex. Every
// surface that labels a chapter's rows must show the ex — name + initial, no
// avatar — never the current partner, and must keep the per-side labels even
// when the stayer is solo today. Two cases, both pinned to the closed chapter
// stayer (Amy) + ex (Ben):
//   (a) Amy is now paired with Cleo (live partner, with an avatar)
//   (b) Amy is now solo
// Failure this guards: nothing errors — Cleo's name and face appear on rows
// Ben paid in a chapter Cleo was never part of, or (b) the rows fall back to
// the generic 「對方」 and the duo-only controls disappear.
// ────────────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { src: string; alt?: string }) => <img src={p.src} alt={p.alt ?? ''} />,
}))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/trips/[id]/_components/EndTripSheet', () => ({ EndTripSheet: () => null }))
vi.mock('@/app/(dashboard)/_components/AvatarMenuProvider', () => ({ useAvatarMenu: () => ({ open: vi.fn() }) }))
vi.mock('@/app/(dashboard)/dashboard/_components/BrandHeaderHint', () => ({ BrandHeaderHint: () => null }))
// Dashboard's neighbours, stubbed to markers so the test sees only which slots render.
vi.mock('@/app/(dashboard)/dashboard/_components/BalanceHero', () => ({ BalanceHero: () => <div data-testid="balance-hero" /> }))
vi.mock('@/app/(dashboard)/dashboard/_components/SoloMonthHero', () => ({ SoloMonthHero: () => <div data-testid="solo-hero" /> }))
vi.mock('@/app/(dashboard)/dashboard/_components/PendingExpenseStack', () => ({
  PendingExpenseStack: ({ pendings }: { pendings: unknown[] }) => (pendings.length ? <div data-testid="pending-expense" /> : null),
}))
vi.mock('@/app/(dashboard)/dashboard/_components/PendingIncomeStack', () => ({
  PendingIncomeStack: ({ pendings }: { pendings: unknown[] }) => (pendings.length ? <div data-testid="pending-income" /> : null),
}))
vi.mock('@/app/(dashboard)/dashboard/_components/BrandHeader', () => ({ BrandHeader: () => null }))
vi.mock('@/app/(dashboard)/_components/ContextStrip', () => ({ ContextStrip: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/ContinuityRow', () => ({ ContinuityRow: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/ModeTogglePlaceholder', () => ({ ModeTogglePlaceholder: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/FirstRecordCard', () => ({ FirstRecordCard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/DashboardFeed', () => ({ DashboardFeed: () => null, DashboardFeedSkeleton: () => null }))
vi.mock('@/app/(dashboard)/assets/[id]/_components/NewFuelLog', () => ({ NewFuelLog: () => null }))
vi.mock('@/actions/fuelLog', () => ({ getFuelLogById: vi.fn() }))
vi.mock('@/app/(dashboard)/_components/RealtimeProvider', () => ({ useRealtimeEvents: () => {} }))
vi.mock('@/app/(dashboard)/_components/QuickAddProvider', () => ({ useQuickAdd: () => ({ pending: null, clear: () => {} }) }))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

import { I18nWrapper } from './_mocks/i18n'
import {
  MemberProvider,
  useViewedPartner,
  type MemberContextValue,
} from '@/app/(dashboard)/_components/MemberContext'
import { buildChapterIdentity } from '@/lib/chapterIdentity'
import { CompactRow, type CompactRowProps } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { BrandHeader } from '@/app/(dashboard)/dashboard/_components/BrandHeader'
import { TripDetailClient, type TripDetailRecord } from '@/app/(dashboard)/trips/[id]/_components/TripDetailClient'
import { Dashboard, type DashboardProps } from '@/app/(dashboard)/dashboard/_components/Dashboard'

// BrandHeader is stubbed for the Dashboard render above; test the real one.
const { BrandHeader: RealBrandHeader } = await vi.importActual<
  typeof import('@/app/(dashboard)/dashboard/_components/BrandHeader')
>('@/app/(dashboard)/dashboard/_components/BrandHeader')
void BrandHeader

const AMY = 'u-amy'
const BEN = 'u-ben'   // the ex: the closed chapter's partner
const CLEO = 'u-cleo' // Amy's partner today, case (a)
const CLEO_AVATAR = 'https://example.test/cleo.png'

const amy = { id: AMY, displayName: 'Amy', initial: 'A', avatarUrl: null, defaultSplitType: 'half' as const, who: 'M' as const }
const cleo = { id: CLEO, displayName: 'Cleo', initial: 'C', avatarUrl: CLEO_AVATAR, defaultSplitType: 'half' as const, who: 'T' as const }

const chapterWithBen = buildChapterIdentity(
  { memberAId: AMY, memberBId: BEN, memberAName: 'Amy', memberBName: 'Ben' },
  AMY,
  '對方',
)

const base: Omit<MemberContextValue, 'partner' | 'isSolo' | 'isPast' | 'viewerIsA' | 'chapter'> = {
  group: { id: 'g1', name: '我們家', baseCurrency: 'twd' },
  viewer: amy,
  canAccessGuardian: false,
  epochStartedAt: '2025-01-01T00:00:00.000Z',
  epochEndedAt: '2025-06-01T00:00:00.000Z',
}

const CASES: Array<[string, MemberContextValue]> = [
  ['(a) stayer now paired with Cleo', { ...base, partner: cleo, isSolo: false, viewerIsA: true, isPast: true, chapter: chapterWithBen }],
  ['(b) stayer now solo', { ...base, partner: null, isSolo: true, viewerIsA: true, isPast: true, chapter: chapterWithBen }],
]

const LIVE_DUO: MemberContextValue = { ...base, epochEndedAt: null, partner: cleo, isSolo: false, viewerIsA: true, isPast: false, chapter: null }
const LIVE_SOLO: MemberContextValue = { ...base, epochEndedAt: null, partner: null, isSolo: true, viewerIsA: true, isPast: false, chapter: null }

function wrap(member: MemberContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nWrapper>
        <MemberProvider value={member}>{children}</MemberProvider>
      </I18nWrapper>
    )
  }
}
const renderAs = (member: MemberContextValue, ui: React.ReactElement) => render(ui, { wrapper: wrap(member) })

const row = (over: Partial<CompactRowProps['tx']>): CompactRowProps['tx'] => ({
  id: 'r1', amount: 1000, splitType: 'half', splitRatioA: null, description: 'Dinner', category: 'food',
  paidBy: BEN, transactedAt: '2025-03-01T00:00:00.000Z', kind: 'transaction', ...over,
})

// ─── the layout's builder ────────────────────────────────────────────────────

describe('buildChapterIdentity', () => {
  it('the other person on the chapter row, name + initial, never an avatar', () => {
    expect(chapterWithBen).toEqual({ partner: { id: BEN, displayName: 'Ben', initial: 'B', avatarUrl: null }, isSolo: false })
  })

  it('works when the viewer was member B of the chapter', () => {
    const id = buildChapterIdentity({ memberAId: BEN, memberBId: AMY, memberAName: 'Ben', memberBName: 'Amy' }, AMY, '對方')
    expect(id.partner).toMatchObject({ id: BEN, displayName: 'Ben' })
  })

  it('a solo chapter has no partner', () => {
    expect(buildChapterIdentity({ memberAId: AMY, memberBId: null, memberAName: 'Amy', memberBName: null }, AMY, '對方'))
      .toEqual({ partner: null, isSolo: true })
  })

  it('an unreadable chapter fails closed (no partner), never the live one', () => {
    expect(buildChapterIdentity(null, AMY, '對方')).toEqual({ partner: null, isSolo: true })
  })

  it('a missing profile name falls back to the generic label', () => {
    const id = buildChapterIdentity({ memberAId: AMY, memberBId: BEN, memberAName: 'Amy', memberBName: null }, AMY, '對方')
    expect(id.partner).toMatchObject({ displayName: '對方', initial: '對' })
  })
})

describe('useViewedPartner', () => {
  it('live: today\'s partner and isSolo, unchanged', () => {
    const { result } = renderHook(() => useViewedPartner(), { wrapper: wrap(LIVE_DUO) })
    expect(result.current).toEqual({ partner: cleo, isSolo: false })
  })

  it('pinned without a chapter identity: no partner (fails closed)', () => {
    const { result } = renderHook(() => useViewedPartner(), {
      wrapper: wrap({ ...CASES[0][1], chapter: undefined }),
    })
    expect(result.current).toEqual({ partner: null, isSolo: true })
  })
})

// ─── surfaces, both cases ───────────────────────────────────────────────────

describe.each(CASES)('pinned to the closed chapter Amy + Ben — %s', (_label, member) => {
  it('CompactRow: Ben paid, with his initial and no avatar; never Cleo', () => {
    const { container } = renderAs(member, <CompactRow tx={row({})} isLast />)
    expect(screen.getByText(/Ben 付/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Cleo/)
    expect(container.textContent).toMatch(/B/)
    expect(container.querySelector('img')).toBeNull()
  })

  it('CompactRow: settlement and income rows name Ben too', () => {
    const { container } = renderAs(member, (
      <>
        <CompactRow tx={row({ id: 's', kind: 'settlement', splitType: null, description: 'x', category: 'settle' })} isLast={false} />
        <CompactRow tx={row({ id: 'i', kind: 'income', splitType: null, description: 'Salary', category: 'salary' })} isLast />
      </>
    ))
    expect(container.textContent).not.toMatch(/Cleo/)
    expect(container.textContent!.match(/Ben/g)?.length).toBe(2)
  })

  it('BrandHeader: Ben\'s initial without an avatar; no Cleo', () => {
    const { container } = renderAs(member, <RealBrandHeader />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.queryByText('C')).toBeNull()
  })

  it('TripDetail: per-side cards are Amy and Ben (present even when solo today); no Cleo, no avatar', () => {
    const records: TripDetailRecord[] = [
      { id: 't1', amount: 600, splitType: 'half', splitRatioA: null, description: 'Hotel', category: 'travel', paidBy: BEN, transactedAt: '2025-03-01T00:00:00.000Z', originalCurrency: null, originalAmount: null },
      { id: 't2', amount: 400, splitType: 'half', splitRatioA: null, description: 'Train', category: 'travel', paidBy: AMY, transactedAt: '2025-03-02T00:00:00.000Z', originalCurrency: 'jpy', originalAmount: 2000 },
    ]
    const { container } = renderAs(member, (
      <TripDetailClient
        trip={{ id: 'trip1', name: 'Kyoto', startDate: '2025-03-01', endDate: '2025-03-05', defaultCurrency: null, rateSnapshot: null, status: 'ended' }}
        records={records}
        baseCurrency="twd"
        groupDefaultRatioA={null}
        activeTrips={[]}
        rates={[]}
      />
    ))
    // Fold preview + the per-currency breakdown (two currencies) + Ben's row.
    expect(screen.getAllByText(/Ben 付了/).length).toBeGreaterThanOrEqual(2)
    expect(container.textContent).not.toMatch(/Cleo/)
    expect(container.querySelector('img')).toBeNull()
  })

  it('Dashboard: the filter row follows the chapter (present), and no BalanceHero or pending stack', () => {
    renderAs(member, <Dashboard {...dashboardProps({ pendings: 1 })} />)
    expect(screen.getByRole('button', { name: /篩選/ })).toBeInTheDocument()
    expect(screen.queryByTestId('balance-hero')).toBeNull()
    expect(screen.queryByTestId('solo-hero')).toBeNull()
    expect(screen.queryByTestId('pending-expense')).toBeNull()
  })

  it('Dashboard income mode: no pending income stack either', () => {
    // Mode lives in the reducer; the gate is the same `!isPast` as expense.
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/dashboard/_components/Dashboard.tsx'), 'utf8')
    expect(src).toContain("{!isPast && mode === 'income' && (")
  })
})

describe('weighted "my share" after a swap that happened after the chapter closed', () => {
  // In the chapter Amy was member A and bore 30%: split_ratio_a = 30. Later
  // confirmSwap made her member B of today's group and flipped split_ratio_a
  // on every row (closed chapters included) to 70, without touching the
  // GroupEpochs row. viewerIsA must come from today's group row (false); the
  // chapter row (Amy = A) would read 70% as hers.
  it('reads the stored ratio with today\'s A/B: Amy\'s share of 1000 is 300', () => {
    const member: MemberContextValue = { ...CASES[0][1], viewerIsA: false }
    const { container } = renderAs(member, (
      <CompactRow tx={row({ paidBy: AMY, splitType: 'weighted', splitRatioA: 70 })} isLast />
    ))
    expect(container.textContent).toContain('$300')
    expect(container.textContent).not.toContain('$700')
  })
})

// ─── the live dashboard is unchanged ────────────────────────────────────────

describe('live (unpinned) surfaces are unchanged', () => {
  it('CompactRow shows today\'s partner with her avatar', () => {
    const { container } = renderAs(LIVE_DUO, <CompactRow tx={row({ paidBy: CLEO })} isLast />)
    expect(screen.getByText(/Cleo 付/)).toBeInTheDocument()
    expect(container.querySelector('img')?.getAttribute('src')).toBe(CLEO_AVATAR)
  })

  it('BrandHeader shows today\'s partner avatar', () => {
    const { container } = renderAs(LIVE_DUO, <RealBrandHeader />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe(CLEO_AVATAR)
  })

  it('duo dashboard: filter row, BalanceHero and the pending stack all render', () => {
    renderAs(LIVE_DUO, <Dashboard {...dashboardProps({ pendings: 1 })} />)
    expect(screen.getByRole('button', { name: /篩選/ })).toBeInTheDocument()
    expect(screen.getByTestId('balance-hero')).toBeInTheDocument()
    expect(screen.getByTestId('pending-expense')).toBeInTheDocument()
  })

  it('solo dashboard: no filter row, the solo month hero, the pending stack', () => {
    renderAs(LIVE_SOLO, <Dashboard {...dashboardProps({ pendings: 1 })} />)
    expect(screen.queryByRole('button', { name: /篩選/ })).toBeNull()
    expect(screen.getByTestId('solo-hero')).toBeInTheDocument()
    expect(screen.getByTestId('pending-expense')).toBeInTheDocument()
  })
})

describe('TransactionFeed realtime filter uses the viewed partner', () => {
  it('matchesFilter is fed useViewedPartner(), not the live partner', () => {
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/_components/TransactionFeed.tsx'), 'utf8')
    const code = src.replace(/^\s*\/\/.*$/gm, '')
    expect(code).toMatch(/const \{ partner \} = useViewedPartner\(\)/)
    expect(code).not.toMatch(/const \{[^}]*\bpartner\b[^}]*\} = useMember\(\)/)
  })
})

function dashboardProps({ pendings }: { pendings: number }): DashboardProps {
  const expensePendings = Array.from({ length: pendings }, (_, i) => ({ id: `p${i}` })) as unknown as DashboardProps['expensePendings']
  return {
    balance: 0,
    pendingBalanceDelta: 0,
    pageSize: 20,
    incomeMonthTotal: 0,
    incomeMonthCount: 0,
    recentIncomeLabel: null,
    expenseMonthTotal: 0,
    expenseMonthCount: 0,
    expenseMonthKey: '2025-03',
    pendings: [],
    expensePendings,
    feedDataPromise: new Promise(() => {}),
    groupDefaultRatioA: null,
    initialHeroCollapsed: false,
    initialIncludePending: false,
    initialTripCollapsed: true,
    reviewCell: { kind: 'empty' } as DashboardProps['reviewCell'],
  }
}
