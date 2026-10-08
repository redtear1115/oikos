import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { CardLargest } from '@/app/(dashboard)/review/[month]/_components/CardLargest'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { ClientReviewSnapshot } from '@/lib/db/queries/monthlyReview'

// #1618 — card 2 renders the payer name the server resolved within the viewed
// chapter. Unknown payer (not one of the chapter's two people, or no id): no
// name chip and card2BodyNoName. Before, an unknown name rendered
// 「最大一筆： 付的「…」」 with a dangling 「 付的」.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

const member: MemberContextValue = {
  group: { id: 'g1', name: 'G', baseCurrency: 'twd' },
  viewer: { id: 'v', initial: 'V', displayName: 'Viewer', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'p', initial: 'P', displayName: 'Partner', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true, isSolo: false, isPast: false, canAccessGuardian: false,
  epochStartedAt: '2026-01-01', epochEndedAt: null,
}

const snapshot = {
  id: 's', groupId: 'g1', year: 2026, month: 9, computedAt: new Date(),
  topCategory: 'dining', topCategoryTotal: 100,
  largestExpenseAmount: 6789, largestExpenseDescription: '晚餐', largestExpenseCategory: 'dining',
  recurringEvents: [], recurringTotalIncome: 0, recurringTotalExpense: 0, assetBreakdown: [],
  bannerDismissedByMemberAAt: null, bannerDismissedByMemberBAt: null,
} satisfies ClientReviewSnapshot

const renderCard = (payerName: string | null) =>
  render(
    <I18nWrapper>
      <MemberProvider value={member}>
        <CardLargest snapshot={snapshot} payerName={payerName} />
      </MemberProvider>
    </I18nWrapper>,
  )

describe('CardLargest payer name (#1618)', () => {
  it('unknown payer: card2BodyNoName, no chip, no stray 「 付的」', () => {
    const { container } = renderCard(null)
    const text = container.textContent ?? ''
    expect(text).toContain('最大一筆：「晚餐」，NT$ 6,789')
    expect(text).not.toContain('付的')
    expect(text).not.toContain('·') // the name chip's separator
  })

  it('known payer: the chip and the named body', () => {
    const { container } = renderCard('已離開的夥伴')
    const text = container.textContent ?? ''
    expect(text).toContain('· 已離開的夥伴')
    expect(text).toContain('最大一筆：已離開的夥伴 付的「晚餐」，NT$ 6,789')
  })
})
