/**
 * #1558 S4 — the dashboard's admin side of 出遊．朋友從分享連結加入.
 * One describe per claim in the S4 brief; actions are mocked (the server
 * side is S2's, covered by __tests__/actions/outing-link-join.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/outings/o1',
}))

const actions = vi.hoisted(() => ({
  getOutingShareLink: vi.fn(),
  resetOutingShareLink: vi.fn(),
  releaseOutingSlot: vi.fn(),
  deactivateOutingParticipant: vi.fn(),
  renameOuting: vi.fn(),
  addOutingExpense: vi.fn(),
  editOutingExpense: vi.fn(),
  deleteOutingExpense: vi.fn(),
  deleteOutingSettlement: vi.fn(),
  addOutingParticipant: vi.fn(),
  recordOutingSettlement: vi.fn(),
  endOuting: vi.fn(),
}))
vi.mock('@/actions/outing', () => actions)
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({ useMember: () => ({ isPast: false }) }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/outings/_components/OutingSheet', () => ({ OutingSheet: () => null }))

import { ShareLinkCard, outingShareUrl } from '@/app/(dashboard)/outings/[id]/_components/ShareLinkCard'
import { OutingDetailClient, type OutingDetailParticipant } from '@/app/(dashboard)/outings/[id]/_components/OutingDetailClient'
import { ExpenseSheet } from '@/app/(dashboard)/outings/_components/ExpenseSheet'
import { SettlementList } from '@/app/(dashboard)/outings/_components/SettlementList'
import { OutingList } from '@/app/(dashboard)/outings/_components/OutingList'
import { participantClaim } from '@/app/(dashboard)/outings/_components/participantClaim'

const ok = <T,>(data: T) => ({ ok: true as const, data })
const fail = (code: string) => ({ ok: false as const, code })
const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

const writeText = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const origin = window.location.origin

// ── 1. Copy share link ──────────────────────────────────────────────────────
describe('copy share link', () => {
  it('builds <origin>/<locale>/outing/<token>', () => {
    expect(outingShareUrl('https://futari.example', 'ja', 'abc')).toBe('https://futari.example/ja/outing/abc')
  })

  it('first click creates the link and copies it; a second click shows the same link', async () => {
    actions.getOutingShareLink.mockResolvedValue(ok({ token: 'tok1' }))
    wrap(<ShareLinkCard outingId="o1" />)
    expect(screen.queryByTestId('outing-share-url')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))
    await screen.findByText('已複製連結')
    const url = `${origin}/zh-TW/outing/tok1`
    expect(screen.getByTestId('outing-share-url').textContent).toBe(url)
    expect(writeText).toHaveBeenLastCalledWith(url)

    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(writeText).toHaveBeenLastCalledWith(url)
    expect(screen.getByTestId('outing-share-url').textContent).toBe(url)
    expect(actions.getOutingShareLink).toHaveBeenCalledWith({ outingId: 'o1' })
    expect(actions.resetOutingShareLink).not.toHaveBeenCalled()
  })

  it('keeps the link on screen when the clipboard refuses', async () => {
    actions.getOutingShareLink.mockResolvedValue(ok({ token: 'tok1' }))
    writeText.mockRejectedValue(new Error('NotAllowedError'))
    wrap(<ShareLinkCard outingId="o1" />)
    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))
    await screen.findByText('沒能自動複製，可以直接選取上面的連結。')
    expect(screen.getByTestId('outing-share-url').textContent).toBe(`${origin}/zh-TW/outing/tok1`)
  })

  it('surfaces a refusal from the server', async () => {
    actions.getOutingShareLink.mockResolvedValue(fail('outing_admin_only'))
    wrap(<ShareLinkCard outingId="o1" />)
    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))
    expect((await screen.findByRole('alert')).textContent).toBe('只有開這次出遊的帳本成員可以這樣做')
    expect(screen.queryByTestId('outing-share-url')).toBeNull()
  })
})

// ── 2. Reset link ───────────────────────────────────────────────────────────
describe('reset share link', () => {
  it('asks first, then swaps in the new link', async () => {
    actions.getOutingShareLink.mockResolvedValue(ok({ token: 'old' }))
    actions.resetOutingShareLink.mockResolvedValue(ok({ token: 'new' }))
    wrap(<ShareLinkCard outingId="o1" />)
    fireEvent.click(screen.getByRole('button', { name: '複製連結' }))
    await screen.findByText('已複製連結')

    fireEvent.click(screen.getByRole('button', { name: '重設連結' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('舊連結會立刻失效。已經加入的人不受影響，照常記帳。')).toBeTruthy()
    expect(actions.resetOutingShareLink).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '重設' }))
    await screen.findByText('已換成新連結，舊連結不能再用了。')
    expect(actions.resetOutingShareLink).toHaveBeenCalledWith({ outingId: 'o1' })
    expect(screen.getByTestId('outing-share-url').textContent).toBe(`${origin}/zh-TW/outing/new`)
  })

  it('cancel leaves the link alone', async () => {
    wrap(<ShareLinkCard outingId="o1" />)
    fireEvent.click(screen.getByRole('button', { name: '重設連結' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(actions.resetOutingShareLink).not.toHaveBeenCalled()
  })
})

// ── Detail page fixtures ────────────────────────────────────────────────────
const P = (over: Partial<OutingDetailParticipant> & { id: string; displayName: string }): OutingDetailParticipant => ({
  active: true, claim: 'unclaimed', releasable: false, isMember: false, ...over,
})
const people: OutingDetailParticipant[] = [
  P({ id: 'A', displayName: '我', claim: 'bound', isMember: true }),
  P({ id: 'B', displayName: '伴', claim: 'bound', isMember: true }),
  P({ id: 'F', displayName: '阿傑' }),
  P({ id: 'G', displayName: '小芳', claim: 'claimed', releasable: true }),
  P({ id: 'H', displayName: '阿明', claim: 'bound' }),
  P({ id: 'T', displayName: '已刪除的使用者', claim: 'claimed', releasable: false }),
  P({ id: 'X', displayName: '老王', active: false }),
]
const expense = {
  id: 'e1', paidByParticipantId: 'A', amount: 900, description: '午餐', category: 'food',
  shares: [{ participantId: 'A', shareAmount: 300 }, { participantId: 'X', shareAmount: 300 }, { participantId: 'G', shareAmount: 300 }],
}
const detail = (over: { status?: 'active' | 'ended' } = {}) => (
  <OutingDetailClient
    outing={{ id: 'o1', name: '九份兩日', currency: 'twd', status: over.status ?? 'active' }}
    view={{ participants: people.map((p) => ({ id: p.id, displayName: p.displayName, net: 0 })), transfers: [], coupleNet: 0 }}
    coupleNet={0}
    expenses={[expense]}
    participants={people}
    settlements={[{ id: 's1', fromParticipantId: 'F', toParticipantId: 'A', amount: 300 }]}
  />
)
const menuFor = (name: string) => screen.queryByRole('button', { name: `${name} 的操作` })
const openMenu = (name: string) => {
  fireEvent.click(menuFor(name)!)
  return screen.getAllByRole('menuitem').map((m) => m.textContent)
}

// ── 3. Claim status ─────────────────────────────────────────────────────────
describe('claim status per participant', () => {
  it('shows 未認領 / 已認領 / 已綁帳號, and 已移除 for a removed one', () => {
    wrap(detail())
    const status = (id: string) => screen.getByTestId(`claim-${id}`).textContent
    expect(status('F')).toBe('未認領')
    expect(status('G')).toBe('已認領')
    expect(status('H')).toBe('已綁帳號')
    expect(status('T')).toBe('已認領')
    expect(status('X')).toBe('已移除')
  })

  it('derives the state from the row like releaseOutingSlot does', () => {
    const at = new Date()
    expect(participantClaim({ profileId: null, claimedAt: null, hasClaimToken: false })).toEqual({ claim: 'unclaimed', releasable: false })
    expect(participantClaim({ profileId: null, claimedAt: at, hasClaimToken: true })).toEqual({ claim: 'claimed', releasable: true })
    expect(participantClaim({ profileId: 'u1', claimedAt: at, hasClaimToken: false })).toEqual({ claim: 'bound', releasable: false })
    // A deleted account's anonymised slot (0083): claimed_at kept, no token.
    expect(participantClaim({ profileId: null, claimedAt: at, hasClaimToken: false })).toEqual({ claim: 'claimed', releasable: false })
  })
})

// ── 4. Release ──────────────────────────────────────────────────────────────
describe('release a slot', () => {
  it('is offered only on a claimed, unbound slot', () => {
    wrap(detail())
    expect(openMenu('小芳')).toContain('釋放')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(openMenu('阿明')).not.toContain('釋放')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(openMenu('已刪除的使用者')).not.toContain('釋放')
  })

  it('confirms, then calls releaseOutingSlot', async () => {
    actions.releaseOutingSlot.mockResolvedValue(ok(undefined))
    wrap(detail())
    openMenu('小芳')
    fireEvent.click(screen.getByRole('menuitem', { name: '釋放' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('釋放「小芳」？')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '釋放' }))
    await waitFor(() => expect(actions.releaseOutingSlot).toHaveBeenCalledWith({ outingId: 'o1', participantId: 'G' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the server refusal in the dialog', async () => {
    actions.releaseOutingSlot.mockResolvedValue(fail('outing_slot_bound'))
    wrap(detail())
    openMenu('小芳')
    fireEvent.click(screen.getByRole('menuitem', { name: '釋放' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '釋放' }))
    expect((await within(dialog).findByRole('alert')).textContent).toBe('這個名字已綁定帳號，不能釋放')
  })
})

// ── 5. Rename, deactivate, edit / delete expense, delete settlement ─────────
describe('rename', () => {
  it('saves the new name through renameOuting', async () => {
    actions.renameOuting.mockResolvedValue(ok(undefined))
    wrap(detail())
    fireEvent.click(screen.getByRole('button', { name: '改名' }))
    const input = await screen.findByDisplayValue('九份兩日')
    fireEvent.change(input, { target: { value: '九份三日' } })
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await waitFor(() => expect(actions.renameOuting).toHaveBeenCalledWith({ outingId: 'o1', name: '九份三日' }))
  })

  it('stays available on an ended outing', () => {
    wrap(detail({ status: 'ended' }))
    expect(screen.getByRole('button', { name: '改名' })).toBeTruthy()
    // …while the per-participant actions and the share card go away.
    expect(menuFor('小芳')).toBeNull()
    expect(screen.queryByText('分享連結')).toBeNull()
  })
})

describe('deactivate a participant', () => {
  it('is offered to friends, not to the ledger members or someone already removed', () => {
    wrap(detail())
    expect(openMenu('阿傑')).toContain('移除')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    // 我 / 伴: bound members, nothing to release or remove → no menu at all.
    expect(menuFor('我')).toBeNull()
    expect(menuFor('老王')).toBeNull()
  })

  it('confirms, then calls deactivateOutingParticipant', async () => {
    actions.deactivateOutingParticipant.mockResolvedValue(ok(undefined))
    wrap(detail())
    openMenu('阿傑')
    fireEvent.click(screen.getByRole('menuitem', { name: '移除' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '移除' }))
    await waitFor(() => expect(actions.deactivateOutingParticipant).toHaveBeenCalledWith({ outingId: 'o1', participantId: 'F' }))
  })
})

describe('ExpenseSheet', () => {
  const list = people.map(({ id, displayName, active }) => ({ id, displayName, active }))
  const chips = (label: string) =>
    within(screen.getByText(label).parentElement as HTMLElement).getAllByRole('button')
  const ticked = () => chips('分給誰').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)

  it('adding: a removed participant is neither preselected nor offered', () => {
    wrap(<ExpenseSheet open outingId="o1" currency="twd" participants={list} onClose={() => {}} />)
    expect(ticked()).toEqual(['我', '伴', '阿傑', '小芳', '阿明', '已刪除的使用者'])
    expect(chips('分給誰').map((b) => b.textContent)).not.toContain('老王')
  })

  it('editing: seeds the expense, keeps a removed person already on it, saves via editOutingExpense', async () => {
    actions.editOutingExpense.mockResolvedValue(ok({ id: 'e2' }))
    const onClose = vi.fn()
    wrap(<ExpenseSheet open outingId="o1" currency="twd" participants={list} expense={expense} onClose={onClose} />)
    expect(ticked()).toEqual(['我', '小芳', '老王'])
    const amount = screen.getByDisplayValue('900')
    fireEvent.change(amount, { target: { value: '1200' } })
    fireEvent.click(screen.getAllByRole('button', { name: '更新' }).at(-1)!)
    await waitFor(() => expect(actions.editOutingExpense).toHaveBeenCalledWith({
      outingId: 'o1', expenseId: 'e1', paidByParticipantId: 'A', amount: 1200,
      participantIds: ['A', 'X', 'G'], description: '午餐', category: 'food',
    }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('editing: delete asks first, then calls deleteOutingExpense', async () => {
    actions.deleteOutingExpense.mockResolvedValue(ok(undefined))
    wrap(<ExpenseSheet open outingId="o1" currency="twd" participants={list} expense={expense} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '刪除這筆支出' }))
    const dialog = await screen.findByRole('dialog', { name: '刪除這筆支出？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))
    await waitFor(() => expect(actions.deleteOutingExpense).toHaveBeenCalledWith({ outingId: 'o1', expenseId: 'e1' }))
  })

  it('a usd amount round-trips in cents', () => {
    wrap(<ExpenseSheet open outingId="o1" currency="usd" participants={list} expense={{ ...expense, amount: 1250 }} onClose={() => {}} />)
    expect(screen.getByDisplayValue('12.5')).toBeTruthy()
  })

  it('opens from an expense row on the detail page', () => {
    wrap(detail())
    fireEvent.click(screen.getByText('午餐'))
    expect(screen.getAllByText('編輯支出').length).toBeGreaterThan(0)
  })
})

describe('delete a settlement', () => {
  it('lists repayments and deletes one after a confirm', async () => {
    actions.deleteOutingSettlement.mockResolvedValue(ok(undefined))
    wrap(
      <SettlementList
        outingId="o1"
        currency="twd"
        settlements={[{ id: 's1', fromParticipantId: 'F', toParticipantId: 'A', amount: 300 }]}
        nameOf={(id) => ({ F: '阿傑', A: '我' })[id] ?? '—'}
        canDelete
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '刪除還款 阿傑 → 我' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('阿傑 → 我，NT$300。刪除後，每個人的淨額會重新計算。')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))
    await waitFor(() => expect(actions.deleteOutingSettlement).toHaveBeenCalledWith({ outingId: 'o1', settlementId: 's1' }))
  })

  it('shows the repayment list on the detail page; no delete once ended', () => {
    wrap(detail({ status: 'ended' }))
    expect(screen.getByText('還款紀錄')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /刪除還款/ })).toBeNull()
  })
})

// ── 6. 我參與的出遊 ─────────────────────────────────────────────────────────
describe('我參與的出遊', () => {
  it('lists other ledgers’ outings, each linking to the public resume route', () => {
    wrap(
      <OutingList
        outings={[{ id: 'own', name: '自己的出遊', status: 'active', currency: 'twd', createdAt: new Date(), participantCount: 3 }]}
        participating={[
          { id: 'x1', name: '小芳的生日', ended: false, href: '/zh-TW/outing/r/x1' },
          { id: 'x2', name: '墾丁', ended: true, href: '/zh-TW/outing/r/x2' },
        ]}
      />,
    )
    const section = screen.getByRole('region', { name: '我參與的出遊' })
    const links = within(section).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/zh-TW/outing/r/x1', '/zh-TW/outing/r/x2'])
    expect(within(section).queryByText('自己的出遊')).toBeNull()
    expect(within(section).getByText('已結束')).toBeTruthy()
  })

  it('is absent when there is nothing to show', () => {
    wrap(<OutingList outings={[]} participating={[]} />)
    expect(screen.queryByText('我參與的出遊')).toBeNull()
  })
})
