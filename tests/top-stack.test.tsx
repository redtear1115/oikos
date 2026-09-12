import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

/**
 * #1037 — the three top-pinned layers stack instead of colliding.
 *
 * `position: sticky` elements do not yield to each other, so three separate
 * `top-0` elements in three different React trees all pinned to the same line:
 * the update notice, the account-deletion banner, and the page's own sticky
 * header. Whichever lost is simply not on screen — and for the deletion banner
 * that means the only escape hatch out of a 14-day destructive countdown.
 *
 * A browser cannot show the bug (its URL bar hides the notch case) and jsdom has
 * no layout at all, so nothing here measures pixels. What these tests pin down
 * is the structure the fix rests on:
 *
 *   1. every shell band is a child of one sticky container, so markup order is
 *      stacking order — no two of them can occupy the same line;
 *   2. the page header is a *sibling after* that container and pins at the
 *      container's published height, so it starts where the container ends;
 *   3. exactly one element pays the status-bar inset, and it is the first band
 *      in the container — or the page header itself when the container is empty.
 *
 * The "who pays the inset" model below is written out in JS rather than handed
 * to jsdom's selector engine, so the CSS contract is asserted separately (first
 * describe block) and a rename in globals.css fails here instead of silently
 * un-testing the behavior.
 */

const cancelAccountDeletion = vi.fn(async () => {})
vi.mock('@/actions/account', () => ({
  cancelAccountDeletion: () => cancelAccountDeletion(),
}))

const exitPastEpoch = vi.fn(async () => {})
vi.mock('@/actions/epoch-view', () => ({
  exitPastEpoch: () => exitPastEpoch(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const isNativePlatform = vi.fn(() => false)
const getPlatform = vi.fn(() => 'web')
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}))
vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: async () => ({
      name: 'Futari',
      id: 'dev.southernlight.futari',
      build: '3',
      version: '1.0.0',
    }),
  },
}))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

import { ShellTopStack } from '@/app/(dashboard)/_components/ShellTopStack'
import { ShellUpdateNotice } from '@/app/(dashboard)/_components/ShellUpdateNotice'
import { AccountDeletionBanner } from '@/app/(dashboard)/_components/AccountDeletionBanner'
import { PastChapterBar } from '@/app/(dashboard)/_components/PastChapterBar'

const REPO_ROOT = process.cwd()
const css = readFileSync(join(REPO_ROOT, 'app/globals.css'), 'utf8')
const source = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8')

// ── the inset model, mirroring the two shipped rules ────────────────────────

/** `.shell-top-strip ~ *` — anything after a strip, among its own siblings. */
function isAfterAStrip(el: Element): boolean {
  let prev = el.previousElementSibling
  while (prev) {
    if (prev.classList.contains('shell-top-strip')) return true
    prev = prev.previousElementSibling
  }
  return false
}

/** `.shell-top-stack:has(> *) ~ *` — anything after a *non-empty* stack. An
 *  empty stack matches nothing, which is what makes a page with no shell band
 *  behave exactly as it did before the stack existed. */
function isAfterAFilledStack(el: Element): boolean {
  let prev = el.previousElementSibling
  while (prev) {
    if (prev.classList.contains('shell-top-stack') && prev.childElementCount > 0) return true
    prev = prev.previousElementSibling
  }
  return false
}

/** `--safe-top` inherits, so the whole cascade for this one property is: does
 *  this element, or any ancestor, sit after something that zeroed it. */
function paysInset(el: Element): boolean {
  let node: Element | null = el
  while (node && node !== document.body) {
    if (isAfterAStrip(node) || isAfterAFilledStack(node)) return false
    node = node.parentElement
  }
  return true
}

// ── fixtures ───────────────────────────────────────────────────────────────

const baseMember: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'u-you', initial: '對', displayName: '小華', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2024-01-01T00:00:00.000Z',
  epochEndedAt: null,
  hadPartner: false,
}

const pastMember: MemberContextValue = {
  ...baseMember,
  isPast: true,
  epochEndedAt: '2024-06-30T00:00:00.000Z',
}

/** The dashboard layout, reduced to the part this ticket is about: one sticky
 *  stack holding every shell band, then `{children}` carrying the page's own
 *  sticky header. The header's classes are the ones the real files use — the
 *  last describe block asserts that against the real files. */
function Shell({
  notice,
  banner,
  pastChapter,
  header = true,
}: {
  notice: boolean
  banner: boolean
  pastChapter: boolean
  header?: boolean
}) {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh">
      <ShellTopStack>
        {notice && <ShellUpdateNotice />}
        {banner && <AccountDeletionBanner requestedAt="2026-09-01T00:00:00.000Z" />}
        {pastChapter && <PastChapterBar />}
      </ShellTopStack>
      <div data-testid="page">
        {header && (
          <div
            data-testid="page-header"
            className="sticky top-[var(--top-stack-h)] z-20 px-5 pt-[max(var(--safe-top),24px)] pb-3"
          />
        )}
      </div>
    </div>
  )
}

function renderShell(opts: {
  notice?: boolean
  banner?: boolean
  pastChapter?: boolean
  header?: boolean
  member?: MemberContextValue
}) {
  const { member = baseMember, notice = false, banner = false, pastChapter = false, header = true } = opts
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nWrapper>
      <MemberProvider value={member}>{children}</MemberProvider>
    </I18nWrapper>
  )
  return render(<Shell notice={notice} banner={banner} pastChapter={pastChapter} header={header} />, { wrapper })
}

function stack(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.shell-top-stack')
  if (!el) throw new Error('no .shell-top-stack rendered')
  return el
}

function bands(): HTMLElement[] {
  return Array.from(stack().children) as HTMLElement[]
}

/** Put the mocked Capacitor shell below the update threshold so the notice shows. */
function withOutdatedShell() {
  isNativePlatform.mockReturnValue(true)
  getPlatform.mockReturnValue('ios')
}

class StubResizeObserver {
  constructor(private cb: () => void) {}
  observe() { this.cb() }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  localStorage.clear()
  isNativePlatform.mockReturnValue(false)
  getPlatform.mockReturnValue('web')
  cancelAccountDeletion.mockClear()
  exitPastEpoch.mockClear()
  vi.stubGlobal('ResizeObserver', StubResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--top-stack-h')
})

// ── the CSS contract the model above mirrors ───────────────────────────────

describe('shell top stack — CSS contract', () => {
  it('declares --top-stack-h with a 0px default', () => {
    expect(css).toMatch(/--top-stack-h:\s*0px/)
  })

  it('zeroes --safe-top below the stack only when the stack holds something', () => {
    expect(css).toMatch(/\.shell-top-stack:has\(>\s*\*\)\s*~\s*\*\s*\{[^}]*--safe-top:\s*0px/)
  })

  it('keeps the strip-to-strip handoff, which now runs inside the stack', () => {
    expect(css).toMatch(/\.shell-top-strip\s*~\s*\*\s*\{[^}]*--safe-top:\s*0px/)
  })
})

// ── the four combinations ──────────────────────────────────────────────────

describe('shell top stack — the worst case and the way down from it', () => {
  it('stacks all three layers in order, with one inset between them', async () => {
    withOutdatedShell()
    renderShell({ notice: true, banner: true, pastChapter: true, member: pastMember })
    await waitFor(() => expect(bands()).toHaveLength(3))

    const [notice, banner, past] = bands()
    const header = screen.getByTestId('page-header')

    // 1. Vertical order is markup order — these are three block children of one
    //    container, so no pair of them can share a line the way three separate
    //    `sticky top-0` elements did.
    expect(notice).toHaveTextContent(zhTW.shellUpdateNotice.message)
    expect(banner).toHaveTextContent(zhTW.accountDeletionBanner.cancel)
    expect(past).toHaveTextContent(zhTW.pastTimes.bannerExitCta)
    expect(notice.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(banner.compareDocumentPosition(past) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // 2. The page header comes after the whole container, and pins at its
    //    height rather than at the top of the viewport.
    expect(stack().compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(header.className).toContain('top-[var(--top-stack-h)]')

    // 3. One inset, paid by whatever is first.
    expect(paysInset(notice)).toBe(true)
    expect(paysInset(banner)).toBe(false)
    expect(paysInset(past)).toBe(false)
    expect(paysInset(header)).toBe(false)
  })

  it('keeps the cancel control reachable when only the banner and the header show', () => {
    renderShell({ banner: true })
    expect(bands()).toHaveLength(1)

    const [banner] = bands()
    const header = screen.getByTestId('page-header')

    expect(screen.getByRole('button', { name: zhTW.accountDeletionBanner.cancel })).toBeTruthy()
    expect(stack().compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(paysInset(banner)).toBe(true)
    expect(paysInset(header)).toBe(false)
  })

  it('leaves the inset to the page header when the stack is empty', () => {
    renderShell({})
    expect(bands()).toHaveLength(0)
    // An empty stack matches no `:has(> *)`, so nothing below it is cancelled —
    // the header is the topmost element on screen and pays, exactly as it did
    // before the stack existed.
    expect(paysInset(screen.getByTestId('page-header'))).toBe(true)
  })

  it('renders an inert, zero-band stack when there is nothing at all', () => {
    renderShell({ header: false })
    expect(bands()).toHaveLength(0)
    expect(stack().className).toContain('sticky')
    expect(stack().className).toContain('top-0')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

// ── the height that travels instead of the element ─────────────────────────

describe('shell top stack — published height', () => {
  it('writes its measured height where page headers read it', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 59.4,
      width: 390, top: 0, left: 0, right: 390, bottom: 59.4, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    renderShell({ banner: true })
    await waitFor(() =>
      // Rounded: a fractional offset would leave a hairline of scrolled content
      // showing between the stack's bottom edge and the header's top.
      expect(document.documentElement.style.getPropertyValue('--top-stack-h')).toBe('59px'),
    )

    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore()
  })

  it('survives an environment with no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => renderShell({ banner: true })).not.toThrow()
  })
})

// ── the real page headers, not the stand-in ────────────────────────────────

/** Every page-level sticky header, and the skeleton that has to line up with
 *  one of them. Growing this list means a new sticky header appeared and has to
 *  join the stack's offset, or it will pin underneath the shell bands. */
const PAGE_STICKY_HEADERS = [
  'app/(dashboard)/records/_components/RecordsList.tsx',
  'app/(dashboard)/trips/[id]/_components/TripDetailClient.tsx',
  'app/(dashboard)/assets/[id]/_components/AibutsuHeader.tsx',
]

describe('page sticky headers — pinned below the stack, not at the viewport top', () => {
  it.each(PAGE_STICKY_HEADERS)('%s pins at the stack height', (path) => {
    const src = source(path)
    expect(src).toContain('sticky top-[var(--top-stack-h)]')
    expect(src).not.toMatch(/className="[^"]*\bsticky\b[^"]*\btop-0\b/)
  })

  it.each([...PAGE_STICKY_HEADERS, 'app/(dashboard)/records/loading.tsx'])(
    '%s reads --safe-top instead of calling env() itself',
    (path) => {
      const src = source(path)
      expect(src).toContain('max(var(--safe-top)')
      // The #1021/#1035 exception is retired: with the stack permanently on top,
      // "is something above me right now" is a static question again.
      expect(src).not.toContain('env(safe-area-inset-top)')
    },
  )

  it('keeps the /records skeleton and its real header on the same formula', () => {
    const formula = /pt-\[max\(var\(--safe-top\),24px\)\]/
    expect(source('app/(dashboard)/records/_components/RecordsList.tsx')).toMatch(formula)
    expect(source('app/(dashboard)/records/loading.tsx')).toMatch(formula)
  })
})
