import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { ja } from '@/lib/i18n/locales/ja'
import { I18nWrapper } from './_mocks/i18n'
import { ContinuityRow } from '@/app/(dashboard)/dashboard/_components/ContinuityRow'
import { TRIP_ENTRY_HREF } from '@/app/(dashboard)/dashboard/_components/TripEntryCell'
import { ReviewIndex } from '@/app/(dashboard)/review/_components/ReviewIndex'
import { deriveReviewCell, type ReviewCellState } from '@/lib/reviewCell'

// #1364 — the home ContinuityRow and the /review index it leads to.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/review',
}))

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)
const aug = { year: 2026, month: 8 }
const links = () => screen.getAllByRole('link')

describe('deriveReviewCell — the three states', () => {
  const snap = (a: Date | null, b: Date | null) => ({ bannerDismissedByMemberAAt: a, bannerDismissedByMemberBAt: b })

  it('A: last month has a review this member has not dismissed', () => {
    expect(deriveReviewCell({ previousMonth: aug, previousSnapshot: snap(null, new Date()), viewerIsA: true, hasAnyReview: true }))
      .toEqual({ kind: 'latest', month: aug })
  })

  it('B: after this member dismisses the banner, the cell still has a destination', () => {
    expect(deriveReviewCell({ previousMonth: aug, previousSnapshot: snap(null, new Date()), viewerIsA: false, hasAnyReview: true }))
      .toEqual({ kind: 'return' })
  })

  it('B: no review for last month, but older ones exist', () => {
    expect(deriveReviewCell({ previousMonth: aug, previousSnapshot: null, viewerIsA: true, hasAnyReview: true }))
      .toEqual({ kind: 'return' })
  })

  it('C: no review yet', () => {
    expect(deriveReviewCell({ previousMonth: aug, previousSnapshot: null, viewerIsA: true, hasAnyReview: false }))
      .toEqual({ kind: 'empty' })
  })
})

describe('ContinuityRow — 月回顧 cell', () => {
  it('A links straight to last month, with the month in the text and the aria-label', () => {
    wrap(<ContinuityRow review={{ kind: 'latest', month: aug }} hasActiveTrip />)
    const [cell] = links()
    expect(cell.getAttribute('href')).toBe('/review/2026-08')
    expect(cell.textContent).toContain('月回顧')
    expect(cell.textContent).toContain('8月的回顧 · 看一看')
    expect(cell.getAttribute('aria-label')).toBe('月回顧：打開8月的回顧')
  })

  it.each<[ReviewCellState, string]>([
    [{ kind: 'return' }, '回到回顧'],
    [{ kind: 'empty' }, '記滿一個月後會在這裡'],
  ])('%o → /review in one tap: "%s"', (review, text) => {
    wrap(<ContinuityRow review={review} hasActiveTrip />)
    const [cell] = links()
    expect(cell.getAttribute('href')).toBe('/review')
    expect(cell.textContent).toContain(text)
    expect(cell.getAttribute('aria-label')).toBe('月回顧：打開回顧列表')
  })

  it('en names the month instead of a number', () => {
    render(
      <TranslationsProvider value={en} locale="en">
        <ContinuityRow review={{ kind: 'latest', month: aug }} hasActiveTrip />
      </TranslationsProvider>,
    )
    expect(links()[0].textContent).toContain('August review · take a look')
  })
})

describe('ContinuityRow — 旅行 cell (option α)', () => {
  it('with no active trip, 旅行 is visible next to 月回顧 and goes to the trip entry', () => {
    wrap(<ContinuityRow review={{ kind: 'empty' }} hasActiveTrip={false} />)
    const all = links()
    expect(all).toHaveLength(2)
    expect(all[1].getAttribute('href')).toBe(TRIP_ENTRY_HREF)
    expect(TRIP_ENTRY_HREF).toBe('/trips')
    expect(all[1].textContent).toContain('旅行')
    expect(all[1].textContent).toContain('開始一趟旅行帳')
  })

  it('with an active trip, only 月回顧 renders (ActiveTripBanner carries the trip)', () => {
    wrap(<ContinuityRow review={{ kind: 'empty' }} hasActiveTrip />)
    expect(links()).toHaveLength(1)
    expect(screen.queryByText('開始一趟旅行帳')).toBeNull()
  })
})

describe('ContinuityRow — presentation rules', () => {
  it('sans titles, no amounts, no exclamation marks, every cell ≥44px', () => {
    const { container } = wrap(<ContinuityRow review={{ kind: 'latest', month: aug }} hasActiveTrip={false} />)
    expect(container.querySelector('.font-serif')).toBeNull()
    expect(container.textContent).not.toMatch(/[!！]|NT\$|\d{3,}/)
    for (const a of links()) expect(a.className).toContain('min-h-11')
  })

  it('no banned words in any locale\'s new copy', () => {
    for (const t of [zhTW, zhCN, en, ja]) {
      const copy = JSON.stringify({ c: t.dashboard.continuity, i: t.monthlyReview.index })
      expect(copy).not.toMatch(/管理|追蹤|監控|[!！]/)
    }
  })
})

describe('/review index', () => {
  it('lists every reviewed month, newest first, each linking to its page', () => {
    wrap(<ReviewIndex monthKeys={['2026-08', '2026-07']} />)
    const list = screen.getByRole('list')
    const items = within(list).getAllByRole('link')
    expect(items.map((a) => a.getAttribute('href'))).toEqual(['/review/2026-08', '/review/2026-07'])
    expect(items[0].textContent).toContain('2026年8月')
  })

  it('with no reviews, says when one will appear — no list, no call to action', () => {
    wrap(<ReviewIndex monthKeys={[]} />)
    expect(screen.getByText('還沒有月回顧')).toBeTruthy()
    expect(screen.getByText('記滿一個月後，那個月的回顧會出現在這裡。')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
