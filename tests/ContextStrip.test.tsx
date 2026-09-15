import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import type { ActiveTripBannerTrip } from '@/app/(dashboard)/dashboard/_components/ActiveTripBanner'

// ── external dependencies ──────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// ContextStrip reads the *delayed* flag (#1244) — the raw one stays exported
// for TransactionFeed. Mocking only the delayed export keeps these tests about
// which band renders; the delay itself is covered in useDelayedOnlineStatus.test.tsx.
vi.mock('@/lib/hooks/useOnlineStatus', () => ({
  useDelayedOnlineStatus: vi.fn(() => true),
}))

vi.mock('@/lib/offline/preference', () => ({
  getOfflinePref: vi.fn(() => false),
}))

vi.mock('@/actions/epoch-view', () => ({
  exitPastEpoch: vi.fn().mockResolvedValue(undefined),
}))

import { useDelayedOnlineStatus } from '@/lib/hooks/useOnlineStatus'
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
  props: {
    activeTrips?: ActiveTripBannerTrip[]
    baseCurrency?: string
    initialTripCollapsed?: boolean
  } = {},
  member: MemberContextValue = baseMember,
) {
  const { initialTripCollapsed = true, ...rest } = props
  return render(
    <ContextStrip {...rest} initialTripCollapsed={initialTripCollapsed} />,
    {
      wrapper: ({ children }) => <Wrapper member={member}>{children}</Wrapper>,
    },
  )
}

// ── tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.mocked(useDelayedOnlineStatus).mockReturnValue(true)
  vi.mocked(getOfflinePref).mockReturnValue(false)
})

describe('ContextStrip', () => {
  it('renders nothing when no conditions apply', () => {
    const { container } = renderStrip()
    expect(container.firstChild).toBeNull()
  })

  it('renders offline banner at highest priority', () => {
    vi.mocked(useDelayedOnlineStatus).mockReturnValue(false)
    vi.mocked(getOfflinePref).mockReturnValue(true)

    const pastMember: MemberContextValue = {
      ...baseMember,
      isPast: true,
      epochEndedAt: '2024-06-30T00:00:00.000Z',
    }

    const { container } = renderStrip({ activeTrips: [tokyoTrip] }, pastMember)

    // Offline text visible
    expect(screen.getByText('離線中・顯示最近一次連線的資料')).toBeTruthy()
    // Trip name not present
    expect(screen.queryByText('Tokyo')).toBeNull()
    // Only one role="status" child rendered
    expect(container.querySelectorAll('[role="status"]').length).toBe(1)
  })

  // #1206: the disconnect notice is no longer gated on offline browsing. The
  // pref only chooses the copy — without it nothing is cached, so the
  // "showing last connection's data" wording would not be true.
  it('renders the no-cache offline notice when offline browsing is off', () => {
    vi.mocked(useDelayedOnlineStatus).mockReturnValue(false)
    vi.mocked(getOfflinePref).mockReturnValue(false)

    const { container } = renderStrip()

    const status = container.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(status?.textContent).toBe('離線中・恢復連線後會自動更新')
    expect(screen.queryByText('離線中・顯示最近一次連線的資料')).toBeNull()
  })

  it('renders the cached-data notice when offline browsing is on', () => {
    vi.mocked(useDelayedOnlineStatus).mockReturnValue(false)
    vi.mocked(getOfflinePref).mockReturnValue(true)

    renderStrip()

    expect(screen.getByRole('status').textContent).toBe('離線中・顯示最近一次連線的資料')
    expect(screen.queryByText('離線中・恢復連線後會自動更新')).toBeNull()
  })

  // #1244: the band no longer disappears in the same frame the network comes
  // back — it collapses for half a second first, so the content below it does
  // not jump up under the reader's eyes.
  it('collapses the offline notice away, then removes it, once back online', () => {
    vi.useFakeTimers()
    try {
      vi.mocked(useDelayedOnlineStatus).mockReturnValue(false)
      const { container, rerender } = renderStrip({ activeTrips: [tokyoTrip] })
      expect(screen.getByRole('status')).toBeTruthy()
      expect(screen.getByRole('status').className).not.toContain('strip-fading')

      vi.mocked(useDelayedOnlineStatus).mockReturnValue(true)
      act(() => {
        rerender(<ContextStrip activeTrips={[tokyoTrip]} initialTripCollapsed />)
      })

      // Still mounted, now collapsing; the trip band waits rather than sliding
      // in underneath a band that is still on screen.
      const exiting = container.querySelector('[role="status"]')
      expect(exiting).not.toBeNull()
      expect(exiting?.className).toContain('strip-fading')
      expect(screen.queryByText('Tokyo')).toBeNull()

      act(() => { vi.advanceTimersByTime(500) })

      expect(container.querySelector('[role="status"]')).toBeNull()
      expect(screen.getByText('Tokyo')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the past-chapter band to the shell top stack', () => {
    const pastMember: MemberContextValue = {
      ...baseMember,
      isPast: true,
      epochEndedAt: '2024-06-30T00:00:00.000Z',
    }

    // The band moved to PastChapterBar in the layout's sticky stack (#1037) —
    // see tests/top-stack.test.tsx. What ContextStrip keeps is the suppression:
    // in a past chapter it renders nothing of its own.
    const { container } = renderStrip({}, pastMember)

    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('回到現在')).toBeNull()
    expect(screen.queryByText('離線中・顯示最近一次連線的資料')).toBeNull()
  })

  // #1119 removed the partner-left variant that used to sit between the
  // past-epoch check and the trip banner. These two guard what its removal
  // could have broken: solo on its own says nothing, and the layer below it
  // still reaches solo viewers.
  it('renders nothing for a solo viewer with no other condition', () => {
    const soloMember: MemberContextValue = { ...baseMember, isSolo: true, partner: null }

    const { container } = renderStrip({}, soloMember)

    expect(container.firstChild).toBeNull()
  })

  it('still renders the trip banner for a solo viewer', () => {
    const soloMember: MemberContextValue = { ...baseMember, isSolo: true, partner: null }

    renderStrip({ activeTrips: [tokyoTrip] }, soloMember)

    expect(screen.getByText('Tokyo')).toBeTruthy()
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

    const { container } = renderStrip({ activeTrips: [tokyoTrip] }, pastMember)

    // A frozen chapter has nothing to be in the middle of.
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('Tokyo')).toBeNull()
  })
})
