import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup, screen } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PostHog, type BeforeSendFn, type CaptureResult } from 'posthog-js'
import {
  POSTHOG_PRIVACY_OPTIONS,
  POSTHOG_PRIVACY_OPTION_NAMES,
  scrubAnalyticsUrls,
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
 * Ledger content and invite tokens that reach PostHog through the *URL*
 * rather than the DOM are covered by the #1274 block below: the shipped
 * `before_send` rewrites every URL-shaped property.
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

/**
 * `before_send` is both a shipped option (#1274 URL scrubbing) and the
 * harness's sink. Spreading `options` over a harness `before_send` would
 * silently replace the sink (nothing captured, every `not.toContain` green);
 * spreading the harness sink over `options` would silently drop the shipped
 * hook. So they are chained: `prepend` (test-only), then the shipped hook(s),
 * then the sink — the sink sees exactly what PostHog would send.
 */
/**
 * `persistence: 'memory'` is a module-global store keyed by project token
 * (`memoryStorage` in `posthog-js/lib/src/storage.js`), so instances booted
 * with the same token share register-once state such as `$referrer` — the
 * first boot's `$direct` would stick for every later one. A token per boot
 * keeps each case independent.
 */
let bootCount = 0

function bootPostHog(
  options: Record<string, unknown>,
  { prepend = [] }: { prepend?: BeforeSendFn[] } = {},
) {
  const captured: unknown[] = []
  const instance = new PostHog()
  const { before_send: shipped, ...rest } = options
  const shippedHooks = (shipped == null ? [] : Array.isArray(shipped) ? shipped : [shipped]) as BeforeSendFn[]
  const sink: BeforeSendFn = (event) => {
    if (event) captured.push(event)
    // Drop everything: nothing should reach a queue or the network.
    return null
  }
  instance.init(`phc_guardrail_test_token_${++bootCount}`, {
    ...HARNESS_OPTIONS,
    ...rest,
    before_send: [...prepend, ...shippedHooks, sink],
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

const SECRET_TOKEN = 'ZZ_TOKEN_ZZ'
const ORIGINAL_REFERRER = Object.getOwnPropertyDescriptor(document, 'referrer')

/**
 * The navigation sequence from #1274: a filtered /records visit arriving from
 * a sign-in page that still carries the invite `next`, then the invite page
 * itself, then an ordinary page and a pageleave. Between them these populate
 * `$current_url`, `$pathname`, `$referrer`, `$prev_pageview_*`,
 * `$session_entry_*` and the `$initial_*` person properties.
 */
function arriveWithSecretsInTheUrl() {
  // Referrer and landing URL are read when PostHog initializes (session entry
  // and initial person props), so they are set before booting.
  Object.defineProperty(document, 'referrer', {
    configurable: true,
    get: () => `https://futari.example/sign-in?next=/invite/${SECRET_TOKEN}`,
  })
  window.history.pushState({}, '', `/records?fAmtMin=${SECRET_AMOUNT}&utm_source=futari_app`)
}

function browseWithSecretsInTheUrl(ph: PostHog) {
  ph.capture('$pageview', {
    $current_url: `${window.location.origin}/records?fAmtMin=${SECRET_AMOUNT}&utm_source=futari_app`,
  })
  window.history.pushState({}, '', `/invite/${SECRET_TOKEN}`)
  ph.capture('$pageview')
  window.history.pushState({}, '', '/dashboard')
  ph.capture('$pageview')
  ph.capture('$pageleave')
}

describe('#1274 — PostHog events must not carry invite tokens or filter values', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
    if (ORIGINAL_REFERRER) Object.defineProperty(document, 'referrer', ORIGINAL_REFERRER)
    else delete (document as unknown as Record<string, unknown>).referrer
  })

  it('leaks the token and the amount without the shipped hook (control)', () => {
    arriveWithSecretsInTheUrl()
    const bare = bootPostHog({ autocapture: false })
    browseWithSecretsInTheUrl(bare.instance)

    expect(bare.count()).toBe(4)
    expect(bare.payload()).toContain(SECRET_TOKEN)
    expect(bare.payload()).toContain(String(SECRET_AMOUNT))
    // The referrer path is exercised too, not only the current URL.
    expect(bare.payload()).toContain(`"$referrer":"https://futari.example/sign-in?next=/invite/${SECRET_TOKEN}"`)
  })

  it('sends neither with the shipped options, but keeps the route and campaign', () => {
    arriveWithSecretsInTheUrl()
    const shipped = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS })
    browseWithSecretsInTheUrl(shipped.instance)

    // Scrubbing, not dropping: all four events still go out.
    expect(shipped.count()).toBe(4)
    const payload = shipped.payload()
    expect(payload).not.toContain(SECRET_TOKEN)
    expect(payload).not.toContain(String(SECRET_AMOUNT))

    const decoded = decodeURIComponent(payload)
    expect(decoded).toContain('utm_source=futari_app')
    expect(decoded).toContain('fAmtMin=<masked>')
    expect(decoded).toContain('/invite/:token')
    // The sign-in referrer keeps its key, loses its value — in the event,
    // the session-entry props and the initial person props alike.
    expect(decoded).toContain('"$referrer":"https://futari.example/sign-in?next=<masked>"')
    expect(decoded).toContain('"$session_entry_referrer":"https://futari.example/sign-in?next=<masked>"')
    expect(decoded).toContain('"$prev_pageview_pathname":"/invite/:token"')
  })

  it('drops the event rather than sending it raw when the hook fails, without throwing', () => {
    // A property whose getter throws forces an error inside the shipped hook
    // (PostHog's own deep copy has already run by the time `before_send`
    // does, so the poison is injected as an earlier hook in the chain).
    const poison: BeforeSendFn = (event) =>
      event && {
        ...event,
        properties: Object.defineProperty({ ...event.properties }, '$current_url', {
          enumerable: true,
          get() {
            throw new Error('boom')
          },
        }),
      }
    const shipped = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS }, { prepend: [poison] })

    window.history.pushState({}, '', `/invite/${SECRET_TOKEN}`)
    expect(() => shipped.instance.capture('$pageview')).not.toThrow()
    expect(shipped.count()).toBe(0)

    // Control: the same boot without poison does capture, so count 0 above
    // is the hook failing closed and not the harness capturing nothing.
    const healthy = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS })
    healthy.instance.capture('$pageview')
    expect(healthy.count()).toBe(1)
  })

  it('scrubs link hrefs in $elements and $elements_chain', () => {
    const shipped = bootPostHog({ ...POSTHOG_PRIVACY_OPTIONS })
    render(
      // preventDefault only stops jsdom's "navigation not implemented" noise;
      // PostHog's document-level listener still sees the click.
      <a
        href={`/invite/${SECRET_TOKEN}?fAmtMin=${SECRET_AMOUNT}`}
        className="invite-link"
        onClick={(e) => e.preventDefault()}
      >
        join
      </a>,
    )
    fireEvent.click(screen.getByText('join'))

    expect(shipped.count()).toBeGreaterThan(0)
    const payload = shipped.payload()
    expect(payload).not.toContain(SECRET_TOKEN)
    expect(payload).not.toContain(String(SECRET_AMOUNT))
    expect(payload).toContain('$elements_chain')
    expect(decodeURIComponent(payload)).toContain('/invite/:token?fAmtMin=<masked>')
  })
})

describe('#1274 — scrubAnalyticsUrls, event shapes the browser test does not reach', () => {
  const base = (properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}): CaptureResult => ({
    uuid: 'u1',
    event: '$pageview',
    properties,
    ...extra,
  })
  const run = (event: CaptureResult) => {
    const out = scrubAnalyticsUrls(event)
    expect(out).not.toBeNull()
    return out as CaptureResult
  }

  it('scrubs $set / $set_once person props and nested web-vitals objects', () => {
    const out = run(
      base(
        {
          $web_vitals_LCP_event: { name: 'LCP', $current_url: `https://a.example/invite/${SECRET_TOKEN}` },
          $set: { $current_url: `/records?fAmtMin=${SECRET_AMOUNT}` },
        },
        {
          $set: { last_seen_url: `/invite/${SECRET_TOKEN}` },
          $set_once: {
            $initial_current_url: `https://a.example/invite/${SECRET_TOKEN}`,
            $initial_pathname: `/invite/${SECRET_TOKEN}`,
            $initial_referrer: `https://a.example/sign-in?next=/invite/${SECRET_TOKEN}`,
            $initial_referring_domain: 'a.example',
          },
        },
      ),
    )
    const json = JSON.stringify(out)
    expect(json).not.toContain(SECRET_TOKEN)
    expect(json).not.toContain(String(SECRET_AMOUNT))
    expect(out.$set_once?.$initial_pathname).toBe('/invite/:token')
    expect(out.$set_once?.$initial_referring_domain).toBe('a.example')
  })

  it('leaves the $direct referrer sentinel and non-URL keys alone', () => {
    const out = run(base({ $referrer: '$direct', $session_entry_referrer: '$direct', title: `/invite/${SECRET_TOKEN}` }))
    expect(out.properties.$referrer).toBe('$direct')
    expect(out.properties.$session_entry_referrer).toBe('$direct')
    // Not URL-keyed: out of scope for this hook by design.
    expect(out.properties.title).toBe(`/invite/${SECRET_TOKEN}`)
  })

  it('sanitizes $heatmap_data keys and merges buckets that collapse together', () => {
    const out = run(
      base(
        {
          $heatmap_data: {
            [`https://a.example/invite/${SECRET_TOKEN}`]: [{ x: 1 }],
            'https://a.example/invite/OTHER': [{ x: 2 }],
          },
        },
        { event: '$$heatmap' },
      ),
    )
    expect(out.properties.$heatmap_data).toEqual({
      'https://a.example/invite/:token': [{ x: 1 }, { x: 2 }],
    })
  })

  it('scrubs hrefs in $elements and in every $elements_chain position', () => {
    const chain =
      `a.x:attr__href="/invite/${SECRET_TOKEN}"href="/invite/${SECRET_TOKEN}"nth-child="1";` +
      `div:data-href="keep"nth-child="2"`
    const out = run(
      base(
        {
          $elements: [{ tag_name: 'a', attr__href: `/invite/${SECRET_TOKEN}?fAmtMin=${SECRET_AMOUNT}` }],
          $elements_chain: chain,
          $external_click_url: `https://b.example/cb?code=${SECRET_TOKEN}`,
        },
        { event: '$autocapture' },
      ),
    )
    expect(JSON.stringify(out)).not.toContain(SECRET_TOKEN)
    expect(out.properties.$elements_chain).toBe(
      'a.x:attr__href="/invite/:token"href="/invite/:token"nth-child="1";div:data-href="keep"nth-child="2"',
    )
    expect(out.properties.$external_click_url).toBe('https://b.example/cb?code=<masked>')
  })

  it('handles escaped quotes inside a chain href', () => {
    const out = run(base({ $elements_chain: `a:href="/x?q=\\"${SECRET_TOKEN}\\""nth-child="1"` }))
    expect(out.properties.$elements_chain).toBe('a:href="/x?q=<masked>"nth-child="1"')
  })

  it('fails closed on a chain href it cannot delimit', () => {
    // escapeQuotes leaves a trailing backslash ambiguous: no closing quote is found.
    expect(scrubAnalyticsUrls(base({ $elements_chain: `a:href="/invite/${SECRET_TOKEN}\\"` }))).toBeNull()
  })

  it('does not mutate the event it was given', () => {
    const nested = { $current_url: `/invite/${SECRET_TOKEN}` }
    const event = base({ $current_url: `/invite/${SECRET_TOKEN}`, nested }, { $set: { a_url: `/invite/${SECRET_TOKEN}` } })
    const before = JSON.stringify(event)
    run(event)
    expect(JSON.stringify(event)).toBe(before)
  })

  it('survives cycles and keeps shared, non-cyclic references intact', () => {
    const shared = { page_url: `/invite/${SECRET_TOKEN}` }
    const cyclic: Record<string, unknown> = { $current_url: `/invite/${SECRET_TOKEN}` }
    cyclic.self = cyclic
    const out = run(base({ a: shared, b: shared, cyclic }))
    expect(out.properties.a).toEqual({ page_url: '/invite/:token' })
    expect(out.properties.b).toEqual({ page_url: '/invite/:token' })
    expect((out.properties.cyclic as Record<string, unknown>).self).toBe('[circular]')
  })

  it('passes $snapshot through untouched and returns null for null', () => {
    const snapshot = base({ $snapshot_data: [{ href: `/invite/${SECRET_TOKEN}` }] }, { event: '$snapshot' })
    expect(scrubAnalyticsUrls(snapshot)).toBe(snapshot)
    expect(scrubAnalyticsUrls(null)).toBeNull()
  })

  it('returns null instead of throwing on hostile input', () => {
    const hostile = base({})
    Object.defineProperty(hostile, 'properties', {
      get() {
        throw new Error('boom')
      },
    })
    expect(() => scrubAnalyticsUrls(hostile)).not.toThrow()
    expect(scrubAnalyticsUrls(hostile)).toBeNull()
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
      before_send: scrubAnalyticsUrls,
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
