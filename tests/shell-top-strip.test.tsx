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
 * listed below with the reason it doesn't need to.
 *
 * The unit of judgement is one pinned element, not one file (#1042). The first
 * version asked both questions — "does anything in this file pin?" and "does
 * anything in this file call env()?" — of the whole file string. The #1035 fix
 * had just added an env() call to every file that pins, so those five files
 * passed no matter what was added to them afterwards; RecordsList.tsx worst of
 * all, 300+ lines with a sticky L1 already in place and a blanket pass for the
 * next one. The scan below walks each occurrence on its own and asks about
 * *that* class list, which means two kinds of "no inset here, and that's right"
 * have to be told apart — see the two exemption tables.
 */

/** Matches a Tailwind class list that pins an element to the top of its
 *  containing block, in either class order. Bounded by the quote characters so
 *  it can't straddle two separate className strings.
 *
 *  Known boundary (#1042): the quote bound is also what stops the match when a
 *  class list is split across several string arguments — `clsx('sticky', 'top-0')`
 *  would not be found. The repo has no class helper today (no clsx / cn /
 *  classnames; every className is one string or one template literal), so this
 *  costs nothing yet. Introducing one means teaching this regex about it, and
 *  the failure mode is silence, so it will not announce itself. */
const PINNED_TO_TOP =
  /(?:\bsticky\b|\bfixed\b)[^"'`]*\btop-0\b|\btop-0\b[^"'`]*(?:\bsticky\b|\bfixed\b)/g

const QUOTE = /["'`]/

/** One pinned element: which file, the class list it carries, and the line it
 *  starts on. `classes` is the identity — line numbers move on every edit above
 *  them, so they are for the failure message only. */
type PinnedElement = { file: string; classes: string; line: number }

/** Widen a regex hit to the surrounding string literal by walking out to the
 *  nearest quote on either side.
 *
 *  Deliberately not `matchAll(/["'`]([^"'`]*)["'`]/g)` over the file: that pairs
 *  quotes left to right, and one apostrophe in a comment ("don't") or inside a
 *  string shifts every pair after it by one. The result is not an error, it is a
 *  silent hole covering the rest of the file. Expanding outward from a known hit
 *  never depends on what came before it. */
function enclosingLiteral(source: string, from: number, to: number): { text: string; start: number } {
  let start = from
  while (start > 0 && !QUOTE.test(source[start - 1])) start--
  let end = to
  while (end < source.length && !QUOTE.test(source[end])) end++
  return { text: source.slice(start, end), start }
}

/** Every pinned element in the given sources, deduped on file + class list.
 *  Two elements carrying byte-identical class lists in one file collapse into
 *  one entry — the exemption tables below are keyed the same way and could not
 *  tell them apart anyway. */
function pinnedElements(files: string[]): PinnedElement[] {
  const found = new Map<string, PinnedElement>()
  for (const full of files) {
    const file = relative(REPO_ROOT, full)
    const source = readFileSync(full, 'utf8')
    for (const match of source.matchAll(PINNED_TO_TOP)) {
      const at = match.index
      const { text, start } = enclosingLiteral(source, at, at + match[0].length)
      const key = `${file} ${text}`
      if (found.has(key)) continue
      found.set(key, { file, classes: text, line: source.slice(0, start).split('\n').length })
    }
  }
  return [...found.values()]
}

/** A pinned element that pays no inset, and the reason that is correct.
 *  Keep the reason concrete — "checked, it's fine" is how #1035 happened. */
type Exemption = { file: string; classes: string; why: string }

/** Category 1 — it pins, but never under the status bar. Its containing block is
 *  some inner scroller, so `top-0` is that box's top edge and not the viewport's. */
const NOT_UNDER_THE_STATUS_BAR: Exemption[] = [
  {
    file: 'app/(dashboard)/_components/RecurringRuleSheet.tsx',
    classes: 'sticky top-0 z-10 mx-5 mt-2 px-4 py-3 rounded-xl text-sm text-white',
    why:
      'the error banner sticks inside SheetBody (flex-1 overflow-y-auto), not the ' +
      'viewport, and SheetFrame is a bottom sheet capped at 92dvh — its top-0 is ' +
      'the sheet body, which never reaches the status bar',
  },
]

/** Category 2 — it does reach the status bar, and the inset is paid inside it.
 *  Splitting "pin" from "pad" across a wrapper and its child is a clean way to
 *  write this: the wrapper's background then extends under the notch while the
 *  child's padding keeps the content clear of it. The wrapper carries no inset by
 *  design, so the per-occurrence scan would otherwise report it every time. */
const INSET_PAID_BY_A_CHILD: Exemption[] = [
  {
    file: 'app/(dashboard)/records/_components/RecordsList.tsx',
    classes: 'sticky top-0 z-20',
    why:
      'this wrapper only pins and paints the background; the L1 row directly ' +
      'inside it carries pt-[max(env(safe-area-inset-top),24px)] and pays the ' +
      'inset for both. Merging them would put the padding on the painted box and ' +
      'leave a gap above the background once pinned',
  },
]

const EXEMPTIONS = [...NOT_UNDER_THE_STATUS_BAR, ...INSET_PAID_BY_A_CHILD]

const describeElement = (el: PinnedElement) => `${el.file}:${el.line} — "${el.classes}"`

const matches = (ex: Exemption, el: PinnedElement) => ex.file === el.file && ex.classes === el.classes

describe('safe-area — everything pinned to the top pays the inset', () => {
  const pinned = pinnedElements([
    ...tsxFiles(join(REPO_ROOT, 'app')),
    ...tsxFiles(join(REPO_ROOT, 'components')),
  ])

  it('finds the pinned elements at all', () => {
    // A scanner that silently matches nothing would make every assertion below
    // pass. #1035 shipped because nothing was looking; this is the tripwire.
    expect(pinned.length).toBeGreaterThanOrEqual(EXEMPTIONS.length + 1)
  })

  it('leaves no sticky/fixed top-0 element without an inset or a reason', () => {
    const unhandled = pinned
      .filter((el) => !el.classes.includes('env(safe-area-inset-top)'))
      .filter((el) => !EXEMPTIONS.some((ex) => matches(ex, el)))
      .map(describeElement)
      .sort()

    expect(unhandled).toEqual([])
  })

  it('keeps the exemption lists free of entries nothing matches any more', () => {
    // An exemption that stopped matching is an exemption nobody will re-read.
    // Either the element moved (update the entry) or it is gone (delete it).
    const stale = EXEMPTIONS.filter((ex) => !pinned.some((el) => matches(ex, el)))
      .map((ex) => `${ex.file} — "${ex.classes}"`)
      .sort()

    expect(stale).toEqual([])
  })

  it('makes every exemption say why', () => {
    for (const ex of EXEMPTIONS) {
      expect(ex.why.trim(), `${ex.file} is exempt without saying why`).not.toBe('')
    }
  })

  it('requires a child-paid exemption to have a payer in the same file', () => {
    // Weak on purpose — it cannot prove the payer is a descendant of this exact
    // wrapper. What it does stop is reaching for this category when the file has
    // no inset anywhere, which would mean nobody is paying at all.
    for (const ex of INSET_PAID_BY_A_CHILD) {
      const source = readFileSync(join(REPO_ROOT, ex.file), 'utf8')
      expect(
        source.includes('env(safe-area-inset-top)'),
        `${ex.file} claims a child pays the inset, but the file never calls env(safe-area-inset-top)`,
      ).toBe(true)
    }
  })
})
