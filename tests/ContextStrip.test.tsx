import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { ActiveTripBannerTrip } from '@/app/(dashboard)/dashboard/_components/ActiveTripBanner'

// ── external dependencies ──────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/lib/hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => true),
}))

vi.mock('@/lib/offline/preference', () => ({
  getOfflinePref: vi.fn(() => false),
}))

vi.mock('@/actions/epoch-view', () => ({
  exitPastEpoch: vi.fn().mockResolvedValue(undefined),
}))

import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import { getOfflinePref } from '@/lib/offline/preference'
import { ContextStrip } from '@/app/(dashboard)/_components/ContextStrip'

// ── base fixtures ──────────────────────────────────────────────────────────

const baseMember: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: {
    id: 'u-me',
    initial: '我',
    displayName: '小明',
    avatarUrl: null,
    defaultSplitType: 'half',
    who: 'M',
  },
  partner: {
    id: 'u-you',
    initial: '對',
    displayName: '小華',
    avatarUrl: null,
    defaultSplitType: 'half',
    who: 'T',
  },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2024-01-01T00:00:00.000Z',
  epochEndedAt: null,
  hadPartner: false,
}

const tokyoTrip: ActiveTripBannerTrip = {
  id: 'trip-1',
  name: 'Tokyo',
  defaultCurrency: 'JPY',
  startDate: '2024-03-01',
}

// ── wrapper helper ─────────────────────────────────────────────────────────

function Wrapper({
  member = baseMember,
  children,
}: {
  member?: MemberContextValue
  children: ReactNode
}) {
  return (
    <I18nWrapper>
      <MemberProvider value={member}>{children}</MemberProvider>
    </I18nWrapper>
  )
}

function renderStrip(
  props: { activeTrips?: ActiveTripBannerTrip[]; baseCurrency?: string } = {},
  member: MemberContextValue = baseMember,
) {
  return render(<ContextStrip {...props} />, {
    wrapper: ({ children }) => <Wrapper member={member}>{children}</Wrapper>,
  })
}

// ── tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.mocked(useOnlineStatus).mockReturnValue(true)
  vi.mocked(getOfflinePref).mockReturnValue(false)
})

describe('ContextStrip', () => {
  it('renders nothing when no conditions apply', () => {
    const { container } = renderStrip()
    expect(container.firstChild).toBeNull()
  })

  it('renders offline banner at highest priority', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false)
    vi.mocked(getOfflinePref).mockReturnValue(true)

    const pastMember: MemberContextValue = {
      ...baseMember,
      isPast: true,
      epochEndedAt: '2024-06-30T00:00:00.000Z',
    }

    const { container } = renderStrip({ activeTrips: [tokyoTrip] }, pastMember)

    // Offline text visible
    expect(screen.getByText('離線中・顯示最近一次連線的資料')).toBeTruthy()
    // Past-epoch exit CTA not present
    expect(screen.queryByText('回到現在')).toBeNull()
    // Trip name not present
    expect(screen.queryByText('Tokyo')).toBeNull()
    // Only one role="status" child rendered
    expect(container.querySelectorAll('[role="status"]').length).toBe(1)
  })

  it('renders past-epoch banner when isPast and online; shows exit button', () => {
    const pastMember: MemberContextValue = {
      ...baseMember,
      isPast: true,
      epochEndedAt: '2024-06-30T00:00:00.000Z',
    }

    renderStrip({}, pastMember)

    expect(screen.getByText('回到現在')).toBeTruthy()
    // Offline banner not shown
    expect(screen.queryByText('離線中・顯示最近一次連線的資料')).toBeNull()
  })

  it('renders partner-left banner when isSolo + hadPartner', () => {
    const soloMember: MemberContextValue = {
      ...baseMember,
      isSolo: true,
      hadPartner: true,
      partner: null,
    }

    renderStrip({}, soloMember)

    expect(screen.getByText('夥伴已離開帳本。之前的紀錄都還在。')).toBeTruthy()
  })

  it('partner-left banner can be dismissed', () => {
    const soloMember: MemberContextValue = {
      ...baseMember,
      isSolo: true,
      hadPartner: true,
      partner: null,
    }

    const { container } = renderStrip({}, soloMember)

    expect(screen.getByText('夥伴已離開帳本。之前的紀錄都還在。')).toBeTruthy()

    const dismissBtn = screen.getByRole('button', { name: 'dismiss' })
    fireEvent.click(dismissBtn)

    expect(container.firstChild).toBeNull()
    expect(localStorage.getItem('context-strip-partner-left-dismissed')).toBe('1')
  })

  it('renders trip name when activeTrips provided (collapsed default)', () => {
    renderStrip({ activeTrips: [tokyoTrip] })

    expect(screen.getByText('Tokyo')).toBeTruthy()
  })

  it('trip does not render when higher-priority condition (isPast) is active', () => {
    const pastMember: MemberContextValue = {
      ...baseMember,
      isPast: true,
      epochEndedAt: '2024-06-30T00:00:00.000Z',
    }

    renderStrip({ activeTrips: [tokyoTrip] }, pastMember)

    // Past-epoch banner shown
    expect(screen.getByText('回到現在')).toBeTruthy()
    // Trip not shown
    expect(screen.queryByText('Tokyo')).toBeNull()
  })
})
