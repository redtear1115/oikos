import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { DateRange, TxnFilter } from '@/lib/filter'

let currentParams = new URLSearchParams()
const replace = vi.fn()
const router = { replace, push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => currentParams,
}))
let onShare: ((d: TxnFilter, r: DateRange) => string) | undefined
vi.mock('next/dynamic', () => ({
  default: () => (p: { onShare?: typeof onShare }) => { if (p.onShare) onShare = p.onShare; return null },
}))
vi.mock('@/app/(dashboard)/records/_components/MonthSwitcher', () => ({ MonthSwitcher: () => null }))
vi.mock('@/app/(dashboard)/records/_components/DateRangeChip', () => ({ DateRangeChip: () => null }))
vi.mock('@/app/(dashboard)/records/_components/DrillFilterChip', () => ({ DrillFilterChip: () => null }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/lib/incomeFeedRow', () => ({ makeIncomeLoader: () => async () => [], incomeToFeedRow: (r: unknown) => r }))

const loadSummaries = vi.fn(async (..._a: unknown[]) => ({ ok: true, data: [] }))
vi.mock('@/actions/transaction', () => ({
  loadMoreFeedAll: vi.fn(async () => ({ ok: true, data: [] })),
  loadMoreTransactions: vi.fn(async () => ({ ok: true, data: [] })),
  loadRecordsMonthSummaries: (...a: unknown[]) => loadSummaries(...a),
}))

let lastFeedFilter: TxnFilter | undefined
let lastEmpty: React.ReactNode = null
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({
  TransactionFeed: ({ filter, emptyState }: { filter?: TxnFilter; emptyState: React.ReactNode }) => {
    lastFeedFilter = filter
    lastEmpty = emptyState
    return <div data-testid="feed" />
  },
}))

import { RecordsList } from '@/app/(dashboard)/records/_components/RecordsList'

const member: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'u-you', initial: '對', displayName: '小華', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2026-01-01T00:00:00.000Z',
  epochEndedAt: null,
}
const monthRange: DateRange = { kind: 'month', monthKey: '2026-05' }
const SUMMARIES: never[] = []
const INITIAL: never[] = []

function tree() {
  return (
    <I18nWrapper>
      <MemberProvider value={member}>
        <RecordsList
          initial={INITIAL}
          pageSize={20}
          monthSummaries={SUMMARIES}
          monthKey="2026-05"
          maxMonthKey="2026-05"
          dateRange={monthRange}
          assets={[]}
          statsSlot={<div data-testid="stats" />}
        />
      </MemberProvider>
    </I18nWrapper>
  )
}

const t = zhTW.records

beforeEach(() => {
  currentParams = new URLSearchParams()
  replace.mockClear()
  loadSummaries.mockClear()
  lastFeedFilter = undefined
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function lastReplaceParams() {
  const url = replace.mock.calls.at(-1)![0] as string
  return new URLSearchParams(url.split('?')[1] ?? '')
}

describe('Records header search entry', () => {
  it('normal mode: icon button with aria-label, no search field', () => {
    render(tree())
    expect(screen.getByRole('button', { name: t.searchOpen })).toBeTruthy()
    expect(screen.queryByPlaceholderText(t.searchPlaceholder)).toBeNull()
    expect(screen.getByText(zhTW.records.title)).toBeTruthy()
  })

  it('tapping it sets ?search=1 and keeps the other params', () => {
    currentParams = new URLSearchParams('month=2026-04&fPayer=mine')
    render(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchOpen }))
    const p = lastReplaceParams()
    expect(p.get('search')).toBe('1')
    expect(p.get('month')).toBe('2026-04')
    expect(p.get('fPayer')).toBe('mine')
  })

  it('search mode shows the field + 取消 instead of the title row', () => {
    currentParams = new URLSearchParams('search=1')
    render(tree())
    const input = screen.getByPlaceholderText(t.searchPlaceholder) as HTMLInputElement
    expect(input.type).toBe('search')
    expect(input.getAttribute('enterkeyhint')).toBe('search')
    expect(screen.getByRole('button', { name: t.searchCancel })).toBeTruthy()
    expect(screen.queryByText(zhTW.records.title)).toBeNull()
  })
})

describe('Records search input -> URL', () => {
  beforeEach(() => {
    currentParams = new URLSearchParams('search=1&month=2026-05')
  })

  it('debounce coalesces typing into one replace', () => {
    render(tree())
    const input = screen.getByPlaceholderText(t.searchPlaceholder)
    fireEvent.change(input, { target: { value: 'f' } })
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.change(input, { target: { value: 'fo' } })
    act(() => { vi.advanceTimersByTime(200) })
    fireEvent.change(input, { target: { value: 'foo' } })
    expect(replace).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(replace).toHaveBeenCalledTimes(1)
    const p = lastReplaceParams()
    expect(p.get('q')).toBe('foo')
    expect(p.get('search')).toBe('1')
    expect(p.get('month')).toBe('2026-05')
  })

  it('IME: nothing during composition, one replace right after compositionend', () => {
    render(tree())
    const input = screen.getByPlaceholderText(t.searchPlaceholder)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'ㄎ' } })
    act(() => { vi.advanceTimersByTime(1000) })
    fireEvent.change(input, { target: { value: 'ㄎㄚ' } })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(replace).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '咖' } })
    fireEvent.compositionEnd(input)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(lastReplaceParams().get('q')).toBe('咖')
    // and the trailing debounce does not fire a second one
    act(() => { vi.advanceTimersByTime(1000) })
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('Enter commits immediately and blurs', () => {
    render(tree())
    const input = screen.getByPlaceholderText(t.searchPlaceholder) as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(replace).toHaveBeenCalledTimes(1)
    expect(lastReplaceParams().get('q')).toBe('foo')
    expect(document.activeElement).not.toBe(input)
  })

  it('Enter that confirms an IME candidate does not submit', () => {
    render(tree())
    const input = screen.getByPlaceholderText(t.searchPlaceholder)
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'ㄎ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(replace).not.toHaveBeenCalled()
  })

  it('clear button empties the field and drops ?q immediately', () => {
    currentParams = new URLSearchParams('search=1&q=foo')
    render(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchClear }))
    expect(replace).toHaveBeenCalledTimes(1)
    const p = lastReplaceParams()
    expect(p.has('q')).toBe(false)
    expect(p.get('search')).toBe('1')
  })
})

describe('Records search cancel', () => {
  it('restores the exact query string from before search mode opened', () => {
    currentParams = new URLSearchParams('month=2026-04&fPayer=mine&view=asset')
    const before = currentParams.toString()
    const { rerender } = render(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchOpen }))
    // the app navigates; then the user types, which adds q
    currentParams = new URLSearchParams(`${before}&search=1&q=foo`)
    rerender(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchCancel }))
    expect(replace.mock.calls.at(-1)![0]).toBe(`/records?${before}`)
  })

  it('falls back to /records when the page was opened already in search mode', () => {
    currentParams = new URLSearchParams('search=1&q=foo')
    render(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchCancel }))
    expect(replace.mock.calls.at(-1)![0]).toBe('/records')
  })

  it('restores an empty pre-search query string as /records', () => {
    const { rerender } = render(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchOpen }))
    currentParams = new URLSearchParams('search=1')
    rerender(tree())
    fireEvent.click(screen.getByRole('button', { name: t.searchCancel }))
    expect(replace.mock.calls.at(-1)![0]).toBe('/records')
  })
})

describe('text-only filter', () => {
  it('feeds the text to the feed + month-summary loader, leaves the chip dot off, uses the filtered empty state', () => {
    const { rerender } = render(tree())
    expect(lastFeedFilter).toBeUndefined()
    loadSummaries.mockClear()

    currentParams = new URLSearchParams('search=1&q=foo')
    rerender(tree())

    expect(lastFeedFilter?.text).toBe('foo')
    // summaries refetched with a wire that carries the text (SSR prop is stale for this key)
    const wire = loadSummaries.mock.calls.at(-1)![3] as { text?: string }
    expect(wire.text).toBe('foo')

    const chip = screen.getByRole('button', { name: zhTW.dashboard.filterAriaLabel })
    expect(chip.querySelector('span[aria-hidden]')).toBeNull()

    render(<I18nWrapper>{lastEmpty}</I18nWrapper>)
    expect(screen.getByText(zhTW.feed.noFiltered)).toBeTruthy()
  })
})

describe('q without search=1 is inert', () => {
  it('does not narrow the feed', () => {
    currentParams = new URLSearchParams('q=foo')
    render(tree())
    expect(lastFeedFilter).toBeUndefined()
  })
})

describe('share URL', () => {
  it('carries search=1 whenever it carries q', async () => {
    const { defaultFilter } = await import('@/lib/filter')
    currentParams = new URLSearchParams('search=1&q=foo')
    render(tree())
    const url = new URL(onShare!(defaultFilter(), monthRange))
    expect(url.searchParams.get('q')).toBe('foo')
    expect(url.searchParams.get('search')).toBe('1')
  })
})

describe('income tab empty state while narrowing', () => {
  it('uses noFiltered, not IncomeEmptyState', () => {
    currentParams = new URLSearchParams('search=1&q=foo')
    render(tree())
    fireEvent.click(screen.getByRole('button', { name: zhTW.records.tabExpense }))
    expect(lastFeedFilter).toBeUndefined() // income tab passes no feed filter
    render(<I18nWrapper>{lastEmpty}</I18nWrapper>)
    expect(screen.getByText(zhTW.feed.noFiltered)).toBeTruthy()
  })
})
