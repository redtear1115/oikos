import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { AvatarMenuData } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { AvatarMenuSheet } from '@/app/(dashboard)/_components/AvatarMenuSheet'
import { runAfterSheetCloseBack } from '@/lib/sheetNavigation'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: pushSpy }),
  // LanguageSwitcher uses usePathname to decide between URL-navigate (public)
  // and cookie+refresh (dashboard). Dashboard tests fix it to a dashboard path.
  usePathname: () => '/dashboard',
}))
// The currency row navigates; it must route through runAfterSheetCloseBack so the
// sheet-close synthetic history.back() doesn't revert the push (#745/#752 race).
vi.mock('@/lib/sheetNavigation', () => ({ runAfterSheetCloseBack: vi.fn() }))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Server actions — stubbed so render doesn't require DB/Supabase.
vi.mock('@/actions/group', () => ({
  updateGroupName: vi.fn(),
  updateGroupSplitRatio: vi.fn(),
  toggleGuardianBeta: vi.fn(),
}))
vi.mock('@/actions/profile', () => ({
  updateDisplayName: vi.fn(),
  updateDefaultSplitType: vi.fn(),
  updateAvatarHidden: vi.fn(),
}))
vi.mock('@/actions/invite', () => ({
  createInvite: vi.fn(),
  revokeOpenInvites: vi.fn(),
}))
vi.mock('@/actions/auth', () => ({
  signOut: vi.fn(),
}))
vi.mock('@/lib/offline/swControl', () => ({
  clearDynamicCache: vi.fn().mockResolvedValue(undefined),
}))

const data: AvatarMenuData = {
  viewerEmail: 'me@example.com',
  groupDefaultRatioA: 60,
  guardianBetaEnabled: false,
  currentLocale: 'zh-TW',
  avatarHidden: false,
  hasOpenInvite: false,
}

function makeCtx(opts: { solo: boolean }): MemberContextValue {
  return {
    group: { id: 'g1', name: '我們家', baseCurrency: 'twd' },
    viewer: {
      id: 'u-me', initial: '我', displayName: '小明',
      avatarUrl: null, defaultSplitType: 'half', who: 'M',
    },
    partner: opts.solo ? null : {
      id: 'u-you', initial: '對', displayName: '小華',
      avatarUrl: null, defaultSplitType: 'half', who: 'T',
    },
    viewerIsA: true,
    isSolo: opts.solo,
    isPast: false,
    canAccessGuardian: false,
    epochStartedAt: '2024-01-01T00:00:00.000Z',
    epochEndedAt: null,
  }
}

const wrap = (ctx: MemberContextValue) => render(
  <I18nWrapper>
    <MemberProvider value={ctx}>
      <AvatarMenuSheet open onClose={() => {}} data={data} />
    </MemberProvider>
  </I18nWrapper>
)

beforeEach(() => { vi.clearAllMocks() })

describe('AvatarMenuSheet — currency navigation', () => {
  it('defers the currency push past the sheet-close history unwind', () => {
    wrap(makeCtx({ solo: false }))
    fireEvent.click(screen.getByRole('button', { name: /幣別/ }))
    // Navigating in the same tick as close lets the backdrop's synthetic
    // history.back() revert the push (#745/#752). The push must be deferred.
    expect(pushSpy).not.toHaveBeenCalled()
    expect(runAfterSheetCloseBack).toHaveBeenCalledTimes(1)
    // The deferred callback performs the actual navigation.
    const deferred = vi.mocked(runAfterSheetCloseBack).mock.calls[0][0]
    deferred()
    expect(pushSpy).toHaveBeenCalledWith('/settings/currency')
  })
})

describe('AvatarMenuSheet — accessibility', () => {
  it('exposes the panel as a labelled modal dialog', () => {
    wrap(makeCtx({ solo: false }))
    // SheetFrame gives every sheet role="dialog" + aria-modal; the hand-rolled
    // panel this replaced had none. Labelled by t.settings.title ('設定').
    const dialog = screen.getByRole('dialog', { name: '設定' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })
})

describe('AvatarMenuSheet — paired mode', () => {
  it('renders viewer + partner names + group name in header', () => {
    wrap(makeCtx({ solo: false }))
    expect(screen.getByText('我們家')).toBeTruthy()
    // Both names appear (viewer in member row + personal section; partner in member row)
    expect(screen.getAllByText(/小明/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/小華/).length).toBeGreaterThan(0)
  })

  it('shows the split-ratio slider section (paired-only)', () => {
    wrap(makeCtx({ solo: false }))
    // SplitRatioSection renders "小明（我）60%" and "小華（對方）40%"
    expect(screen.getByText(/（我）60%/)).toBeTruthy()
    expect(screen.getByText(/（對方）40%/)).toBeTruthy()
  })

  it('does NOT show the solo invite CTA', () => {
    wrap(makeCtx({ solo: false }))
    // inviteCta = '邀請對方加入' — only rendered in solo mode
    expect(screen.queryByRole('button', { name: /邀請/ })).toBeNull()
  })
})

describe('AvatarMenuSheet — solo mode', () => {
  it('renders only viewer in member list + shows invite CTA', () => {
    wrap(makeCtx({ solo: true }))
    expect(screen.getAllByText(/小明/).length).toBeGreaterThan(0)
    // Partner should not appear at all
    expect(screen.queryByText('小華')).toBeNull()
    // The invite CTA button — t.settings.inviteCta = '邀請對方加入'
    expect(screen.getByRole('button', { name: /邀請/ })).toBeTruthy()
  })

  it('hides the split-ratio slider section', () => {
    wrap(makeCtx({ solo: true }))
    // The slider labels only render in paired mode
    expect(screen.queryByText(/（我）.*%/)).toBeNull()
    expect(screen.queryByText(/（對方）.*%/)).toBeNull()
  })

  it('shows the solo lock hint under split-type section', () => {
    wrap(makeCtx({ solo: true }))
    // t.settings.soloLockHint = '單人狀態下，每筆記錄都算你的。' (#1122 — the
    // old wording promised "邀請對方加入後可調整", which reads as a waiting room
    // to someone whose partner just left.)
    expect(screen.getByText(/單人狀態下，每筆記錄都算你的/)).toBeTruthy()
  })
})

// #1604 (S3 verifier advisory A2) — the sheet opens from BrandHeader while
// pinned to a past chapter too. Its member list, avatar cluster and split
// ratio are TODAY's ledger settings; inside an old chapter they put the new
// partner's name and photo next to the ex's records. Pinned → none of today's
// partner appears in the sheet. Failure looks like nothing: the sheet renders,
// with 小華 (today's partner) in it while the viewer looks at chapter 1.
describe('AvatarMenuSheet — pinned to a past chapter (#1604)', () => {
  function pinnedCtx(opts: { liveSolo: boolean }): MemberContextValue {
    const base = makeCtx({ solo: opts.liveSolo })
    return {
      ...base,
      partner: base.partner ? { ...base.partner, avatarUrl: 'https://img.example/partner-now.jpg' } : null,
      isPast: true,
      epochEndedAt: '2024-06-01T00:00:00.000Z',
      chapter: {
        partner: { id: 'u-ex', displayName: '阿前', initial: '阿', avatarUrl: null },
        isSolo: false,
      },
    }
  }

  it("shows no trace of today's partner: no member row, no photo, no split ratio", () => {
    const { container } = wrap(pinnedCtx({ liveSolo: false }))
    expect(screen.queryByText(/小華/)).toBeNull()
    expect(container.innerHTML).not.toContain('partner-now.jpg')
    expect(screen.queryByText(/（對方）.*%/)).toBeNull()
    // The viewer is still listed.
    expect(screen.getAllByText(/小明/).length).toBeGreaterThan(0)
  })

  it('a live duo pinned to a past chapter gets no invite CTA (hiding the row is not "solo")', () => {
    wrap(pinnedCtx({ liveSolo: false }))
    expect(screen.queryByRole('button', { name: /邀請/ })).toBeNull()
  })

  it('a live solo pinned to a past chapter keeps the invite CTA, as before', () => {
    wrap(pinnedCtx({ liveSolo: true }))
    expect(screen.getByRole('button', { name: /邀請/ })).toBeTruthy()
  })

  it('unpinned control: the live partner row and photo are shown', () => {
    const ctx = makeCtx({ solo: false })
    const { container } = wrap({ ...ctx, partner: { ...ctx.partner!, avatarUrl: 'https://img.example/partner-now.jpg' } })
    expect(screen.getAllByText(/小華/).length).toBeGreaterThan(0)
    expect(container.innerHTML).toContain('partner-now.jpg')
  })
})
