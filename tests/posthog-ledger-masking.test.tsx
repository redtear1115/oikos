import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PostHog } from 'posthog-js'
import {
  POSTHOG_PRIVACY_OPTIONS,
  POSTHOG_PRIVACY_OPTION_NAMES,
} from '@/lib/analytics/posthogPrivacy'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import {
  MemberProvider,
  type MemberContextValue,
} from '@/app/(dashboard)/_components/MemberContext'
import { I18nWrapper } from './_mocks/i18n'

/**
 * #1267 — the guardrail for "PostHog must never receive ledger content".
 *
 * Two halves, and both are needed:
 *
 * 1. **Behavioral.** A real `PostHog` instance, initialized with the real
 *    `POSTHOG_PRIVACY_OPTIONS`, watching a real `CompactRow`. Clicks are fired
 *    at the row, at the description, and at the amount; the captured payloads
 *    must contain neither string. This tests posthog-js's actual behavior
 *    rather than our reading of its docs, so a library upgrade that changes
 *    masking semantics turns this red instead of shipping quietly.
 *
 *    A masking test can fail open in the most boring way imaginable — the
 *    harness captures nothing at all, every `not.toContain` passes, and the
 *    suite is green while production leaks. So every masked assertion is
 *    paired with an **unmasked control** on the same DOM: without the options,
 *    the same clicks *must* leak. If the control stops leaking, the harness is
 *    broken, and the test says so.
 *
 * 2. **Source-level.** Masking only protects the components nobody remembers
 *    to think about for as long as it is actually wired into `init()`. So:
 *    the provider must spread the shared constant, must not re-declare any of
 *    its keys, and there must be exactly one `posthog.init()` in the tree with
 *    no later `set_config()` walking it back.
 *
 * What neither half covers, deliberately: ledger content that reaches PostHog
 * through the *URL* rather than the DOM. `$current_url` is captured on every
 * event and no masking option touches it. See the PR for `fAmtMin`/`fAmtMax`.
 */

const REPO_ROOT = process.cwd()

/** Distinctive enough that a substring match cannot be a false positive. */
const SECRET_DESCRIPTION = 'ZZ_LEDGER_DESCRIPTION_ZZ'
// Under 1億: `formatRowAmount` abbreviates anything larger to "9.9億", which
// would hide the digits from the leak assertions for the wrong reason.
const SECRET_AMOUNT = 87654321
const SECRET_AMOUNT_RENDERED = SECRET_AMOUNT.toLocaleString('en-US')

/**
 * Options the harness needs that production does not: no network, no remote
 * config (autocapture stays disabled until `/flags` answers, which never
 * happens in jsdom), and a sink to read events out of. None of these touch
 * masking — the "overrides nothing privacy-relevant" case below proves it.
 */
const HARNESS_OPTIONS = {
  api_host: 'https://posthog.invalid',
  persistence: 'memory',
  capture_pageview: false,
  capture_pageleave: false,
  disable_surveys: true,
  advanced_disable_flags: true,
  disable_external_dependency_loading: true,
} as const

function bootPostHog(options: Record<string, unknown>) {
  const captured: unknown[] = []
  const instance = new PostHog()
  instance.init('phc_guardrail_test_token', {
    ...HARNESS_OPTIONS,
    before_send: (event) => {
      if (event) captured.push(event)
      // Drop everything: nothing should reach a queue or the network.
      return null
    },
    ...options,
  })
  return { instance, payload: () => JSON.stringify(captured), count: () => captured.length }
}

const member: MemberContextValue = {
  group: { id: 'g1', name: 'G' },
  viewer: {
    id: 'viewer-1',
    initial: 'V',
    displayName: 'Viewer',
    avatarUrl: null,
    defaultSplitType: 'half',
    who: 'M',
  },
  partner: {
    id: 'partner-1',
    initial: 'P',
    displayName: 'Partner',
    avatarUrl: null,
    defaultSplitType: 'half',
    who: 'T',
  },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2026-01-01',
  epochEndedAt: null,
}

function renderRow() {
  return render(
    <I18nWrapper>
      <MemberProvider value={member}>
        <CompactRow
          tx={{
            id: 'tx-1',
            amount: SECRET_AMOUNT,
            splitType: 'half',
            splitRatioA: null,
            description: SECRET_DESCRIPTION,
            category: 'food',
            paidBy: 'viewer-1',
            transactedAt: '2026-05-01',
            kind: 'transaction',
          }}
          isLast
          onClick={() => {}}
        />
      </MemberProvider>
    </I18nWrapper>,
  )
}

/** The three places a thumb actually lands on a transaction row. */
function clickEveryPartOfTheRow() {
  const description = screen.getByText(SECRET_DESCRIPTION)
  // Commas are literal in a regex, and the amount cell also holds the "NT$"
  // prefix as a separate text node, so match on a substring.
  const amount = screen.getByText(new RegExp(SECRET_AMOUNT_RENDERED))
  const row = description.closest('button')
  expect(row).not.toBeNull()

  fireEvent.click(row!)
  fireEvent.click(description)
  fireEvent.click(amount)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('#1267 — autocapture must not carry ledger content', () => {
  it('leaks the description and the amount without the masking options (control)', () => {
    // This is the bug as reported, reproduced. If this test ever stops
    // failing-open, the harness below proves nothing.
    const bare = bootPostHog({ autocapture: true })
    renderRow()
    clickEveryPartOfTheRow()

    expect(bare.count()).toBeGreaterThan(0)
    expect(bare.payload()).toContain(SECRET_DESCRIPTION)
    expect(bare.payload()).toContain(SECRET_AMOUNT_RENDERED)
  })

  it('leaks nothing with the shipped options', () => {
    const shipped = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS })
    renderRow()
    clickEveryPartOfTheRow()

    // Events still flow — this is masking, not "turn PostHog off".
    expect(shipped.count()).toBeGreaterThan(0)
    expect(shipped.payload()).not.toContain(SECRET_DESCRIPTION)
    // Both as rendered and as bare digits.
    expect(shipped.payload()).not.toContain(SECRET_AMOUNT_RENDERED)
    expect(shipped.payload()).not.toContain(String(SECRET_AMOUNT))
  })

  it('still records that a click happened, and where', () => {
    // The point of masking over `ph-no-capture` / `autocapture: false`: the
    // interaction skeleton survives. If this breaks, we have silently traded
    // away the data the disposition promised to keep.
    const shipped = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS })
    renderRow()
    clickEveryPartOfTheRow()

    const payload = shipped.payload()
    expect(payload).toContain('$autocapture')
    expect(payload).toContain('$elements_chain')
    expect(payload).toContain('"tag_name":"button"')
  })

  it('does not capture copied ledger text', () => {
    // `$selected_content` is written straight from `window.getSelection()` and
    // is NOT covered by `mask_all_text` — copy-capture has to stay off, not
    // merely masked. Stubbing the selection means this test actually fires if
    // `capture_copied_text` is ever switched on (or flips by default).
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => SECRET_DESCRIPTION,
    } as unknown as Selection)

    const shipped = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS })
    renderRow()
    fireEvent.copy(screen.getByText(SECRET_DESCRIPTION))
    fireEvent.cut(screen.getByText(SECRET_DESCRIPTION))

    expect(shipped.payload()).not.toContain(SECRET_DESCRIPTION)
  })

  it('overrides nothing privacy-relevant in the harness itself', () => {
    // Guards the one way these tests could lie: a harness option quietly
    // standing in for a shipped one.
    for (const name of POSTHOG_PRIVACY_OPTION_NAMES) {
      expect(Object.keys(HARNESS_OPTIONS)).not.toContain(name)
    }
  })
})

describe('#1267 — the masking config cannot be quietly unwired', () => {
  const PROVIDER = 'app/providers.tsx'
  const providerSource = readFileSync(join(REPO_ROOT, PROVIDER), 'utf8')

  it('pins the exact option values, so a flip shows up in review', () => {
    expect(POSTHOG_PRIVACY_OPTIONS).toEqual({
      autocapture: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      disable_session_recording: true,
    })
  })

  it('spreads the shared options into posthog.init()', () => {
    expect(providerSource).toContain('...POSTHOG_PRIVACY_OPTIONS')
  })

  it('does not re-declare any masked option beside the spread', () => {
    // A literal `mask_all_text: false` after the spread would win silently.
    const withoutComments = stripComments(providerSource)
    for (const name of POSTHOG_PRIVACY_OPTION_NAMES) {
      expect(
        new RegExp(`(^|[\\s{,])${name}\\s*:`).test(withoutComments),
        `${PROVIDER} writes \`${name}\` literally; it must come from POSTHOG_PRIVACY_OPTIONS only`,
      ).toBe(false)
    }
  })

  it('initializes PostHog exactly once, and never re-configures it', () => {
    const offenders = { init: [] as string[], reconfigure: [] as string[] }
    for (const file of sourceFiles()) {
      const text = stripComments(readFileSync(file, 'utf8'))
      const rel = relative(REPO_ROOT, file)
      if (/\.init\s*\(/.test(text) && /posthog/i.test(text)) offenders.init.push(rel)
      if (/\.set_config\s*\(|startSessionRecording\s*\(|capture_copied_text/.test(text)) {
        offenders.reconfigure.push(rel)
      }
    }
    expect(offenders.init).toEqual([PROVIDER])
    expect(offenders.reconfigure).toEqual([])
  })
})

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Every `.ts`/`.tsx` under the app's own source roots. */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(full)) out.push(full)
    }
  }
  for (const root of ['app', 'lib', 'components', 'actions']) walk(join(REPO_ROOT, root))
  return out
}
