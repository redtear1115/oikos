import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/outings',
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({ isPast: false }),
}))
// Stub BottomNav — its FAB/nav pulls in matchMedia + prefetch wiring out of
// scope for a list-shape test.
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}))
// Stub OutingSheet — it pulls in the createOuting server action, out of scope
// for a list-shape unit test.
vi.mock('@/app/(dashboard)/outings/_components/OutingSheet', () => ({
  OutingSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="outing-sheet" /> : null),
}))

import { OutingList } from '@/app/(dashboard)/outings/_components/OutingList'
import type { OutingListRow } from '@/lib/db/queries/outing'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

const row = (over: Partial<OutingListRow>): OutingListRow => ({
  id: 'o1', name: '九份兩日', status: 'active', currency: 'twd',
  createdAt: new Date('2026-06-01'), participantCount: 4, ...over,
})

describe('OutingList', () => {
  it('renders the empty state when there are no outings', () => {
    wrap(<OutingList outings={[]} />)
    expect(screen.getByText('還沒有出遊')).toBeTruthy()
  })

  it('renders an active outing row with its participant count', () => {
    wrap(<OutingList outings={[row({})]} />)
    expect(screen.getByText('九份兩日')).toBeTruthy()
    expect(screen.getByText('4 人')).toBeTruthy()
  })

  it('separates past outings under the past section with an ended tag', () => {
    wrap(<OutingList outings={[row({ id: 'o2', name: '宜蘭', status: 'ended', participantCount: 3 })]} />)
    expect(screen.getByText('宜蘭')).toBeTruthy()
    expect(screen.getByText('已結束')).toBeTruthy()
  })
})
