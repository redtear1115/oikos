import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createElement, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'

// #1488 — quick add delivery: QuickAddProvider (shell listener + `#add=`
// fragment) → in-memory prefill → Dashboard opens AddSheet in CREATE mode.
// AddSheet itself is a stub here that records its props; the real sheet's
// save path is covered in tests/quick-add-addsheet-1488.test.tsx.

const h = vi.hoisted(() => ({
  native: false,
  pathname: '/dashboard',
  push: vi.fn(),
  launchUrl: undefined as string | undefined,
  /** Delivered to the first appUrlOpen listener, like iOS's retained cold-start event. */
  retained: [] as string[],
  listener: null as null | ((e: { url: string }) => void),
  removed: 0,
  removeAll: 0,
  addSheetProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => h.pathname,
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native } }))
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (_event: string, cb: (e: { url: string }) => void) => {
      h.listener = cb
      for (const url of h.retained.splice(0)) cb({ url })
      return {
        remove: async () => {
          h.removed++
          if (h.listener === cb) h.listener = null
        },
      }
    },
    getLaunchUrl: async () => (h.launchUrl ? { url: h.launchUrl } : undefined),
    removeAllListeners: async () => { h.removeAll++ },
  },
}))

// next/dynamic → React.lazy, so Dashboard's dynamic sheets resolve to the mocks below.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(() => loader().then((C) => ({ default: C })))
    return function Dynamic(props: Record<string, unknown>) {
      return createElement(Suspense, { fallback: null }, createElement(Lazy, props))
    }
  },
}))

vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({
  AddSheet: (props: Record<string, unknown>) => {
    h.addSheetProps.push(props)
    return props.open ? <div role="dialog" aria-modal="true" data-testid="add-sheet" /> : null
  },
}))
vi.mock('@/app/(dashboard)/dashboard/_components/SettlementSheet', () => ({ SettlementSheet: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/IncomeSheet', () => ({ IncomeSheet: () => null }))
vi.mock('@/app/(dashboard)/trips/_components/TripSheet', () => ({ TripSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/[id]/_components/NewFuelLog', () => ({ NewFuelLog: () => null }))
vi.mock('@/actions/fuelLog', () => ({ getFuelLogById: vi.fn() }))
vi.mock('@/app/(dashboard)/_components/RealtimeProvider', () => ({ useRealtimeEvents: () => {} }))
vi.mock('@/app/(dashboard)/dashboard/_components/BrandHeader', () => ({ BrandHeader: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/ModeTogglePlaceholder', () => ({ ModeTogglePlaceholder: () => null }))
vi.mock('@/app/(dashboard)/_components/ContextStrip', () => ({ ContextStrip: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/SoloMonthHero', () => ({ SoloMonthHero: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/BalanceHero', () => ({ BalanceHero: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/ContinuityRow', () => ({ ContinuityRow: () => null }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/DashboardFilterRow', () => ({ DashboardFilterRow: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/DashboardFeed', () => ({
  DashboardFeed: () => null,
  DashboardFeedSkeleton: () => null,
}))
vi.mock('@/app/(dashboard)/dashboard/_components/PendingIncomeStack', () => ({ PendingIncomeStack: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/PendingExpenseStack', () => ({ PendingExpenseStack: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/FirstRecordCard', () => ({ FirstRecordCard: () => null }))

import {
  QuickAddProvider,
  useQuickAdd,
  QUICK_ADD_COLD_START_DEDUPE_MS,
  QUICK_ADD_HANDLED_PREFIX,
} from '@/app/(dashboard)/_components/QuickAddProvider'
import { ToastProvider } from '@/components/Toast'
import { Dashboard, type DashboardProps } from '@/app/(dashboard)/dashboard/_components/Dashboard'

function member(isPast = false): MemberContextValue {
  return {
    group: { id: 'g1', name: '我們家', baseCurrency: 'twd' },
    viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
    partner: null,
    viewerIsA: true,
    isSolo: true,
    isPast,
    canAccessGuardian: false,
    epochStartedAt: '2024-01-01T00:00:00.000Z',
    epochEndedAt: null,
  }
}

const dashboardProps: DashboardProps = {
  balance: 0,
  pendingBalanceDelta: 0,
  pageSize: 20,
  incomeMonthTotal: 0,
  incomeMonthCount: 0,
  recentIncomeLabel: null,
  expenseMonthTotal: 0,
  expenseMonthCount: 0,
  expenseMonthKey: '2026-10',
  pendings: [],
  expensePendings: [],
  feedDataPromise: new Promise(() => {}),
  groupDefaultRatioA: null,
  activeTrips: [
    { id: 't1', name: '京都', defaultCurrency: 'jpy', startDate: '2000-01-01', endDate: null },
  ],
  initialHeroCollapsed: false,
  initialIncludePending: false,
  initialTripCollapsed: true,
  reviewCell: { kind: 'none' } as unknown as DashboardProps['reviewCell'],
}

function Shell({ children, isPast = false }: { children: ReactNode; isPast?: boolean }) {
  return (
    <I18nWrapper>
      <MemberProvider value={member(isPast)}>
        <ToastProvider><QuickAddProvider>{children}</QuickAddProvider></ToastProvider>
      </MemberProvider>
    </I18nWrapper>
  )
}

/** Stands in for Dashboard where only "how many prefills arrived" matters. */
function Probe({ log }: { log: unknown[] }) {
  const { pending, clear } = useQuickAdd()
  useEffect(() => {
    if (!pending) return
    log.push(pending)
    clear()
  }, [pending, clear, log])
  return null
}

const openedProps = () => h.addSheetProps.filter((p) => p.open)
const ADD = 'dev.southernlight.futari://add?amount=120&category=dining&note=%E5%8D%88%E9%A4%90'

/** Let the dynamic import + async listener registration settle. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => {
  h.native = false
  h.pathname = '/dashboard'
  h.push.mockReset()
  h.launchUrl = undefined
  h.retained = []
  h.listener = null
  h.removed = 0
  h.removeAll = 0
  h.addSheetProps = []
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/dashboard')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('web: /dashboard#add=expense&…', () => {
  it('opens AddSheet prefilled in create mode and strips the fragment', async () => {
    window.history.replaceState(null, '', '/dashboard#add=expense&amount=120&category=dining&note=%E5%8D%88%E9%A4%90')
    render(<Shell><Dashboard {...dashboardProps} /></Shell>)

    await screen.findByTestId('add-sheet')
    const p = openedProps().at(-1)!
    expect(p.initial).toBeUndefined()
    expect(p.pendingExpenseId).toBeUndefined()
    expect(p.prefilledAmount).toBe(120)
    expect(p.prefilledCategory).toBe('dining')
    expect(p.prefilledDescription).toBe('午餐')
    // An active trip covers today, yet a URL prefill must not be auto-tagged.
    expect(p.skipTripAutoDetect).toBe(true)

    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/dashboard')
    expect(h.push).not.toHaveBeenCalled()
  })

  it('does not reopen on remount / reload', async () => {
    window.history.replaceState(null, '', '/dashboard#add=expense&amount=120')
    const first = render(<Shell><Dashboard {...dashboardProps} /></Shell>)
    await screen.findByTestId('add-sheet')
    first.unmount()

    h.addSheetProps = []
    render(<Shell><Dashboard {...dashboardProps} /></Shell>)
    await flush()
    expect(openedProps()).toHaveLength(0)
  })

  it('a FAB-style open carries no prefill', async () => {
    render(<Shell><Dashboard {...dashboardProps} /></Shell>)
    await flush()
    expect(openedProps()).toHaveLength(0)
  })

  it('pinned to a past chapter: no AddSheet, fragment still stripped', async () => {
    window.history.replaceState(null, '', '/dashboard#add=expense&amount=120&category=dining')
    render(<Shell isPast><Dashboard {...dashboardProps} /></Shell>)
    await flush()
    expect(openedProps()).toHaveLength(0)
    expect(window.location.hash).toBe('')
  })

  it('a non-add fragment is left alone', async () => {
    window.history.replaceState(null, '', '/dashboard#section')
    render(<Shell><Dashboard {...dashboardProps} /></Shell>)
    await flush()
    expect(window.location.hash).toBe('#section')
    expect(openedProps()).toHaveLength(0)
  })

  it('an income fragment is stripped but opens nothing', async () => {
    window.history.replaceState(null, '', '/dashboard#add=income&amount=5000')
    render(<Shell><Dashboard {...dashboardProps} /></Shell>)
    await flush()
    expect(window.location.hash).toBe('')
    expect(openedProps()).toHaveLength(0)
  })

  it('a same-document hashchange on /dashboard is picked up', async () => {
    render(<Shell><Dashboard {...dashboardProps} /></Shell>)
    await flush()
    act(() => {
      window.history.replaceState(null, '', '/dashboard#add=expense&amount=77')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByTestId('add-sheet')
    expect(openedProps().at(-1)!.prefilledAmount).toBe(77)
  })

  it('the fragment is ignored off /dashboard', async () => {
    h.pathname = '/records'
    window.history.replaceState(null, '', '/records#add=expense&amount=120')
    const log: unknown[] = []
    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toHaveLength(0)
    expect(h.push).not.toHaveBeenCalled()
  })
})

describe('shell: gates on another route', () => {
  function App({ route, withModal }: { route: string; withModal: boolean }) {
    return (
      <Shell>
        {withModal && <div role="dialog" aria-modal="true" data-testid="edit-sheet" />}
        {route === '/dashboard' ? <Dashboard {...dashboardProps} /> : <div data-testid="records" />}
      </Shell>
    )
  }

  it('on /records with a sheet open: keeps the route and opens nothing', async () => {
    h.native = true
    h.pathname = '/records'
    render(<App route="/records" withModal />)
    await flush()
    act(() => h.listener!({ url: ADD }))
    await flush()
    expect(h.push).not.toHaveBeenCalled()
    expect(screen.getByTestId('edit-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('records')).toBeInTheDocument()
    expect(openedProps()).toHaveLength(0)
    // Dropped-by-gate URLs are recorded too, so a reload cannot resurrect them.
    expect(window.sessionStorage.getItem(QUICK_ADD_HANDLED_PREFIX + ADD)).toBe('1')
  })

  it('on /records with nothing open: navigates to /dashboard and the sheet opens prefilled', async () => {
    h.native = true
    h.pathname = '/records'
    const view = render(<App route="/records" withModal={false} />)
    await flush()
    act(() => h.listener!({ url: ADD }))
    expect(h.push).toHaveBeenCalledWith('/dashboard')
    expect(h.push).toHaveBeenCalledTimes(1)

    h.pathname = '/dashboard'
    view.rerender(<App route="/dashboard" withModal={false} />)
    await screen.findByTestId('add-sheet')
    const p = openedProps().at(-1)!
    expect(p.initial).toBeUndefined()
    expect(p.prefilledAmount).toBe(120)
    expect(p.prefilledDescription).toBe('午餐')
  })

  it('pinned to a past chapter: drops it with no navigation', async () => {
    h.native = true
    h.pathname = '/records'
    const log: unknown[] = []
    render(<Shell isPast><Probe log={log} /></Shell>)
    await flush()
    act(() => h.listener!({ url: ADD }))
    await flush()
    expect(h.push).not.toHaveBeenCalled()
    expect(log).toHaveLength(0)
  })

  it('a non-add URL (OAuth callback) does nothing at all', async () => {
    h.native = true
    h.pathname = '/records'
    const log: unknown[] = []
    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    act(() => h.listener!({ url: 'dev.southernlight.futari://login-callback/auth/callback?code=x' }))
    await flush()
    expect(h.push).not.toHaveBeenCalled()
    expect(log).toHaveLength(0)
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('shell: launch URL / event de-duplication and the handled-URL record', () => {
  beforeEach(() => {
    h.native = true
  })

  it('cold start, retained event first then getLaunchUrl: opens once', async () => {
    h.retained = [ADD]
    h.launchUrl = ADD
    const log: unknown[] = []
    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toEqual([{ amount: 120, category: 'dining', description: '午餐' }])
  })

  it('cold start, getLaunchUrl first then the event: the duplicate event is ignored', async () => {
    h.launchUrl = ADD
    const log: unknown[] = []
    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toHaveLength(1)
    act(() => h.listener!({ url: ADD }))
    await flush()
    expect(log).toHaveLength(1)
  })

  it('the launch URL is handled once per WebView session: a remount does not reopen it', async () => {
    h.launchUrl = ADD
    const log: unknown[] = []
    const first = render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toHaveLength(1)
    first.unmount()

    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toHaveLength(1)
  })

  it('warm open → remount (iOS getLaunchUrl now returns it) → no reopen; a second warm run of the same URL opens again', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const log: unknown[] = []
    const first = render(<Shell><Probe log={log} /></Shell>)
    await flush()
    act(() => h.listener!({ url: ADD }))
    await flush()
    expect(log).toHaveLength(1)
    first.unmount()

    // iOS: getLaunchUrl reports the last opened URL.
    h.launchUrl = ADD
    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toHaveLength(1)

    // Two equal payments are legitimate: the same Shortcut run again, warm.
    now.mockReturnValue(1_000_000 + QUICK_ADD_COLD_START_DEDUPE_MS + 60_000)
    act(() => h.listener!({ url: ADD }))
    await flush()
    expect(log).toHaveLength(2)
  })

  it('storage unavailable: the launch URL is not opened (it could not be recorded), a warm event still is', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    h.launchUrl = ADD
    const log: unknown[] = []
    render(<Shell><Probe log={log} /></Shell>)
    await flush()
    expect(log).toHaveLength(0)
    act(() => h.listener!({ url: 'dev.southernlight.futari://add?amount=9' }))
    await flush()
    expect(log).toEqual([{ amount: 9 }])
  })

  it('unmount removes only its own handle, never all listeners', async () => {
    const view = render(<Shell><Probe log={[]} /></Shell>)
    await flush()
    expect(h.listener).toBeTypeOf('function')
    view.unmount()
    await flush()
    expect(h.removed).toBe(1)
    expect(h.removeAll).toBe(0)
  })

  it('unmounted before registration finishes: the late handle is removed', async () => {
    const view = render(<Shell><Probe log={[]} /></Shell>)
    view.unmount()
    await flush()
    expect(h.removeAll).toBe(0)
    expect(h.listener).toBeNull()
  })

  it('not native: no listener at all', async () => {
    h.native = false
    render(<Shell><Probe log={[]} /></Shell>)
    await flush()
    expect(h.listener).toBeNull()
  })
})

describe('grep guard: removeAllListeners on @capacitor/app', () => {
  // SignInButton (OAuth callback, #1315), TextScale and QuickAddProvider each
  // hold their own listener on @capacitor/app. removeAllListeners from any one
  // of them silently kills the others — the failure is Google sign-in in the
  // shell never completing, with no error anywhere.
  it('is never called in app code', () => {
    const root = resolve(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) {
          const src = readFileSync(full, 'utf8')
          // `App.removeAllListeners`, or any removeAllListeners in a file that
          // imports @capacitor/app (covers a destructured / aliased import).
          // Other plugins' own removeAllListeners (PushNotifications) are not
          // this guard's business.
          if (
            /\bApp\s*\.\s*removeAllListeners\b/.test(src) ||
            (src.includes("'@capacitor/app'") && src.includes('removeAllListeners'))
          ) {
            hits.push(full.slice(root.length + 1))
          }
        }
      }
    }
    for (const dir of ['app', 'components', 'lib']) walk(join(root, dir))
    expect(hits).toEqual([])
  })
})
