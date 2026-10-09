import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/outings/o1',
}))
// Stub the action sheets — they import server actions out of scope here.
vi.mock('@/app/(dashboard)/outings/_components/ExpenseSheet', () => ({ ExpenseSheet: () => null }))
vi.mock('@/actions/outing', () => ({}))
vi.mock('@/app/(dashboard)/outings/[id]/_components/AddParticipantSheet', () => ({ AddParticipantSheet: () => null }))
vi.mock('@/app/(dashboard)/outings/[id]/_components/SettleSheet', () => ({ SettleSheet: () => null }))
vi.mock('@/app/(dashboard)/outings/[id]/_components/EndOutingSheet', () => ({ EndOutingSheet: () => null }))

import { OutingDetailClient } from '@/app/(dashboard)/outings/[id]/_components/OutingDetailClient'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

const p = (id: string, displayName: string) =>
  ({ id, displayName, active: true, claim: 'bound' as const, releasable: false, isMember: true })
const participants = [p('A', '我'), p('B', '伴'), { ...p('F', '阿傑'), claim: 'unclaimed' as const, isMember: false }]

const view = {
  participants: [
    { id: 'A', displayName: '我', net: 600 },
    { id: 'B', displayName: '伴', net: -300 },
    { id: 'F', displayName: '阿傑', net: -300 },
  ],
  transfers: [
    { from: 'B', to: 'A', amount: 300 },
    { from: 'F', to: 'A', amount: 300 },
  ],
  coupleNet: 300,
}

describe('OutingDetailClient', () => {
  it('renders share link, participant nets, transfers and the expense feed', () => {
    wrap(
      <OutingDetailClient
        outing={{ id: 'o1', name: '九份兩日', currency: 'twd', status: 'active' }}
        view={view}
        foldPreview={300}
        expenses={[{ id: 'e1', paidByParticipantId: 'A', amount: 900, description: '午餐', category: null, shares: [{ participantId: 'A', shareAmount: 300 }, { participantId: 'B', shareAmount: 300 }, { participantId: 'F', shareAmount: 300 }] }]}
        participants={participants}
      />,
    )
    expect(screen.getByText('九份兩日')).toBeTruthy()
    expect(screen.getByText('午餐')).toBeTruthy()
    // a transfer row "阿傑 → 我"
    expect(screen.getByText('阿傑 → 我')).toBeTruthy()
    // action buttons present while active
    expect(screen.getByText('記一筆')).toBeTruthy()
  })

  it('shows the ended note and hides actions when not active', () => {
    wrap(
      <OutingDetailClient
        outing={{ id: 'o1', name: '宜蘭', currency: 'twd', status: 'ended' }}
        view={{ participants: [], transfers: [], coupleNet: 0 }}
        foldPreview={0}
        expenses={[]}
        participants={[]}
      />,
    )
    expect(screen.getByText('這次出遊已經結束。')).toBeTruthy()
    expect(screen.queryByText('記一筆')).toBeNull()
  })

  const fold = (status: 'active' | 'ended', foldPreview: number) =>
    wrap(
      <OutingDetailClient
        outing={{ id: 'o1', name: '九份兩日', currency: 'twd', status }}
        view={view}
        foldPreview={foldPreview}
        expenses={[]}
        participants={participants}
      />,
    )

  it('shows the fold note only when the preview is non-zero (active, current chapter)', () => {
    fold('active', 300)
    expect(screen.getByText(/300/, { selector: 'p' })).toBeTruthy()
    expect(document.body.textContent).toContain(zhTW.outing.coupleFoldNote.replace('{amount}', 'NT$300'))
  })

  it('shows no fold note for an ended outing or a closed chapter (preview 0), even if the view has a couple net', () => {
    fold('ended', 0)
    expect(document.body.textContent).not.toContain(zhTW.outing.coupleFoldNote.split('{amount}')[0])
  })
})
