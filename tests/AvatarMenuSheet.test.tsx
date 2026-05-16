import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { AvatarMenuData } from '@/app/(dashboard)/_components/AvatarMenuProvider'
import { AvatarMenuSheet } from '@/app/(dashboard)/_components/AvatarMenuSheet'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

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
}))
vi.mock('@/actions/invite', () => ({
  createInvite: vi.fn(),
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
}

function makeCtx(opts: { solo: boolean }): MemberContextValue {
  return {
    group: { id: 'g1', name: '我們家' },
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
    // t.settings.soloLockHint = '單人狀態下固定為「全部我的」，邀請對方加入後可調整。'
    expect(screen.getByText(/單人狀態下固定為/)).toBeTruthy()
  })
})
