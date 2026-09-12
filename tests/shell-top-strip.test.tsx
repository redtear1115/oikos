import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

/**
 * #1021 — who pays the status-bar inset.
 *
 * The bug only reproduces inside a native shell (a browser's URL bar hides it),
 * so none of this can be eyeballed. What CAN be pinned down is the rule the fix
 * rests on: exactly one element on screen absorbs `env(safe-area-inset-top)`,
 * and it is always the topmost one. These tests check that rule structurally —
 * the shipped CSS selector is read out of globals.css and then run against real
 * rendered DOM for every combination of the two shell top strips.
 */

const cancelAccountDeletion = vi.fn(async () => {})
vi.mock('@/actions/account', () => ({
  cancelAccountDeletion: () => cancelAccountDeletion(),
}))

const isNativePlatform = vi.fn(() => false)
const getPlatform = vi.fn(() => 'web')
const getInfo = vi.fn(async () => ({
  name: 'Futari',
  id: 'dev.southernlight.futari',
  build: '3',
  version: '1.0.0',
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}))
vi.mock('@capacitor/app', () => ({
  App: { getInfo: () => getInfo() },
}))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

import { AccountDeletionBanner } from '@/app/(dashboard)/_components/AccountDeletionBanner'
import { ShellUpdateNotice } from '@/app/(dashboard)/_components/ShellUpdateNotice'

/** Vitest runs from the repo root (vitest.config.ts lives there). */
const REPO_ROOT = process.cwd()
const css = readFileSync(join(REPO_ROOT, 'app/globals.css'), 'utf8')

/** The rule that hands the inset down the shell. Read from the shipped CSS so a
 *  rename there fails here instead of silently un-testing the behavior. */
const COLLAPSE_SELECTOR = '.shell-top-strip ~ *'

/** An element pays the inset when neither it nor any ancestor has had
 *  `--safe-top` zeroed — the custom property inherits, so `closest()` over the
 *  collapse selector is the whole cascade for this one var. */
function paysInset(el: Element): boolean {
  return el.closest(COLLAPSE_SELECTOR) === null
}

function strips(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.shell-top-strip'))
}

/** Stand-in for a page header: the same `--safe-top` formula every non-sticky
 *  dashboard header uses (asserted against the real files further down). */
function Shell({ notice, banner }: { notice: boolean; banner: boolean }) {
  return (
    <div className="relative max-w-md mx-auto min-h-dvh">
      {notice && <ShellUpdateNotice />}
      {banner && <AccountDeletionBanner requestedAt="2026-09-01T00:00:00.000Z" />}
      <div data-testid="page">
        <div data-testid="page-header" className="px-5 pt-[max(var(--safe-top),24px)] pb-3" />
      </div>
    </div>
  )
}

function renderShell(opts: { notice: boolean; banner: boolean }) {
  return render(<Shell {...opts} />, { wrapper: I18nWrapper })
}

/** Put the mocked Capacitor shell below the update threshold so the notice shows. */
function withOutdatedShell() {
  isNativePlatform.mockReturnValue(true)
  getPlatform.mockReturnValue('ios')
}

beforeEach(() => {
  localStorage.clear()
  isNativePlatform.mockReturnValue(false)
  getPlatform.mockReturnValue('web')
  cancelAccountDeletion.mockClear()
})

describe('shell top strips — CSS contract', () => {
  it('defines --safe-top as the real inset by default', () => {
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top,\s*0px\)/)
  })

  it('makes the strip absorb the inset and zero it for everything after', () => {
    expect(css).toMatch(/\.shell-top-strip\s*\{[^}]*padding-top:\s*max\(var\(--safe-top\)/)
    expect(css).toMatch(/\.shell-top-strip\s*~\s*\*\s*\{[^}]*--safe-top:\s*0px/)
  })
})

describe('shell top strips — inset ownership', () => {
  it('leaves the inset to the page header when no strip is on screen', async () => {
    renderShell({ notice: false, banner: false })
    await waitFor(() => expect(strips()).toHaveLength(0))
    expect(paysInset(screen.getByTestId('page-header'))).toBe(true)
  })

  it('moves the inset to the deletion banner and off the page header', async () => {
    renderShell({ notice: false, banner: true })
    const [banner] = strips()
    expect(banner).toHaveTextContent(zhTW.accountDeletionBanner.cancel)
    expect(paysInset(banner)).toBe(true)
    expect(paysInset(screen.getByTestId('page-header'))).toBe(false)
  })

  it('moves the inset to the shell update notice when it is alone', async () => {
    withOutdatedShell()
    renderShell({ notice: true, banner: false })
    await waitFor(() => expect(strips()).toHaveLength(1))
    const [notice] = strips()
    expect(notice).toHaveTextContent(zhTW.shellUpdateNotice.message)
    expect(paysInset(notice)).toBe(true)
    expect(paysInset(screen.getByTestId('page-header'))).toBe(false)
  })

  it('gives the inset to the notice only — not the banner below it — when both show', async () => {
    withOutdatedShell()
    renderShell({ notice: true, banner: true })
    await waitFor(() => expect(strips()).toHaveLength(2))
    const [notice, banner] = strips()
    expect(notice).toHaveTextContent(zhTW.shellUpdateNotice.message)
    expect(banner).toHaveTextContent(zhTW.accountDeletionBanner.cancel)

    // The whole point: one inset, paid once, by whatever is on top.
    expect(paysInset(notice)).toBe(true)
    expect(paysInset(banner)).toBe(false)
    expect(paysInset(screen.getByTestId('page-header'))).toBe(false)
  })
})

describe('account deletion banner — reachable escape hatch', () => {
  it('keeps the live region on the sentence, not around the control', () => {
    renderShell({ notice: false, banner: true })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(zhTW.accountDeletionBanner.message.split('{date}')[0].trim())
    expect(status.querySelector('button')).toBeNull()
  })

  it('gives the cancel control a 44px touch target', () => {
    renderShell({ notice: false, banner: true })
    const button = screen.getByRole('button', { name: zhTW.accountDeletionBanner.cancel })
    // jsdom has no layout, so the token class is the assertable artifact:
    // min-h-11 === 44px === --control-md.
    expect(button.className).toContain('min-h-11')
  })

  it('gives the update notice dismiss the same target', async () => {
    withOutdatedShell()
    renderShell({ notice: true, banner: false })
    const button = await screen.findByRole('button', { name: zhTW.shellUpdateNotice.dismissAriaLabel })
    expect(button.className).toContain('min-h-11')
    expect(button.className).toContain('min-w-11')
  })
})

/** Walk a directory for .tsx sources. */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) tsxFiles(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('shell top strips — no header re-introduces its own inset', () => {
  it('keeps raw env(safe-area-inset-top) to the documented sticky exception', () => {
    const offenders = tsxFiles(join(REPO_ROOT, 'app/(dashboard)'))
      .filter((f) => readFileSync(f, 'utf8').includes('env(safe-area-inset-top)'))
      .map((f) => relative(REPO_ROOT, f))
      .sort()

    // A sticky header outlives the strip above it (the strip scrolls away, the
    // header pins), so every one of them — and the skeleton that has to match
    // one pixel for pixel — keeps paying the inset itself. Every other dashboard
    // header must read --safe-top, or a banner will push it under the notch.
    // Growing this list means a new sticky header appeared; shrinking it means
    // one stopped paying, which is #1035 all over again.
    expect(offenders).toEqual([
      'app/(dashboard)/_components/ContextStrip.tsx',
      'app/(dashboard)/assets/[id]/_components/AibutsuHeader.tsx',
      'app/(dashboard)/records/_components/RecordsList.tsx',
      'app/(dashboard)/records/loading.tsx',
      'app/(dashboard)/trips/[id]/_components/TripDetailClient.tsx',
    ])
  })
})

/**
 * #1035 — the same rule read from the other end.
 *
 * The allowlist above is keyed on "who calls env()", so it only ever catches a
 * header that *added* an inset it shouldn't have. It cannot catch the opposite
 * mistake — an element that pins itself to the top of the viewport and pays no
 * inset at all, which is how ContextStrip spent its whole life rendering a 35px
 * bar underneath a 47px notch. Anything that can become the topmost element on
 * screen has to be enumerated, so this guard starts from the position property
 * instead: every `sticky top-0` / `fixed top-0` either handles the inset or is
 * listed here with the reason it doesn't need to.
 */

/** Matches a Tailwind class list that pins an element to the top of its
 *  containing block, in either class order. Bounded by the quote characters so
 *  it can't straddle two separate className strings. */
const PINNED_TO_TOP =
  /(?:\bsticky\b|\bfixed\b)[^"'`]*\btop-0\b|\btop-0\b[^"'`]*(?:\bsticky\b|\bfixed\b)/

/** Pinned elements that are not affected by the status bar, with the reason.
 *  Keep the reason concrete — "checked, it's fine" is how #1035 happened.
 *
 *  ⚠️ Known blind spot, tracked in #1042: both filters below run over the whole
 *  file, so once a file contains one `env(safe-area-inset-top)` anywhere, every
 *  *other* pinned element in that same file inherits the pass. The fix for #1035
 *  was precisely "add env() to each file that pins", so after this lands all five
 *  such files are blind — RecordsList.tsx most of all, since it already carries a
 *  sticky L1 and is 300+ lines.
 *
 *  Going per-occurrence is not a one-line change: RecordsList's sticky wrapper
 *  (`className="sticky top-0 z-20"`) legitimately carries no inset because its
 *  inner row pays it, so a per-string check reports it as unhandled. The
 *  follow-up needs to separate "carries no inset and doesn't need one" from
 *  "carries no inset and its child pays", which is a second exemption category,
 *  not a tighter regex. Verified by prototype — the naive version fails exactly
 *  on that wrapper. */
const NOT_UNDER_THE_STATUS_BAR: Record<string, string> = {
  'app/(dashboard)/_components/RecurringRuleSheet.tsx':
    'the error banner sticks inside SheetBody (flex-1 overflow-y-auto), not the ' +
    'viewport, and SheetFrame is a bottom sheet capped at 92dvh — its top-0 is ' +
    'the sheet body, which never reaches the status bar',
}

describe('safe-area — everything pinned to the top pays the inset', () => {
  it('leaves no sticky/fixed top-0 element without an inset or a reason', () => {
    const unhandled = [...tsxFiles(join(REPO_ROOT, 'app')), ...tsxFiles(join(REPO_ROOT, 'components'))]
      .map((f) => ({ path: relative(REPO_ROOT, f), source: readFileSync(f, 'utf8') }))
      .filter(({ source }) => PINNED_TO_TOP.test(source))
      .filter(({ source }) => !source.includes('env(safe-area-inset-top)'))
      .map(({ path }) => path)
      .sort()

    expect(unhandled).toEqual(Object.keys(NOT_UNDER_THE_STATUS_BAR).sort())
  })

  it('makes every exemption state its scroll container', () => {
    for (const [path, reason] of Object.entries(NOT_UNDER_THE_STATUS_BAR)) {
      expect(reason.trim(), `${path} is exempt without saying why`).not.toBe('')
    }
  })
})
