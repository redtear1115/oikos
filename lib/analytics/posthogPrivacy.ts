import type { BeforeSendFn, CaptureResult, PostHogConfig } from 'posthog-js'
import { sanitizeAnalyticsUrl } from '@/lib/analytics/urlSanitizer'

/**
 * #1274 — PostHog's last stop before the network: every URL-shaped value in
 * the event goes through `sanitizeAnalyticsUrl` (invite token → `:token`,
 * non-allowlisted query values → `<masked>`, hash dropped).
 *
 * `$current_url` is not the only copy. PostHog also writes the page URL, or
 * its path, into `$pathname`, `$referrer`, `$prev_pageview_pathname`,
 * `$session_entry_url` / `_pathname` / `_referrer`, the `$initial_*` person
 * properties in `$set_once`, `$web_vitals_*_event.$current_url`, the keys of
 * `$heatmap_data`, and — for links — `attr__href` in `$elements` and
 * `href="…"` / `attr__href="…"` inside the `$elements_chain` string. Setting
 * `$current_url` explicitly (as `posthog-pageview.tsx` does) leaves every one
 * of those raw, which is why this is a key-suffix walk and not a field list.
 *
 * Rules:
 * - Any key, at any depth inside `properties` / `$set` / `$set_once`, whose
 *   lower-cased name ends with `url`, `pathname` or `referrer`, plus
 *   `attr__href`, has its string value sanitized. PostHog's `$direct`
 *   referrer sentinel is left alone.
 * - `$elements_chain` has its `href` / `attr__href` values rewritten in place.
 * - Keys of `$heatmap_data` are URLs and are sanitized (buckets that collapse
 *   onto the same sanitized URL are merged).
 * - `$snapshot` (session replay) passes untouched; replay is disabled below.
 * - The input event is never mutated: PostHog only deep-copies it when
 *   truncation is on (`_noTruncate` skips that, e.g. for `$exception`), so
 *   nested objects may be shared with the caller. Objects and arrays are
 *   rebuilt instead.
 *
 * ## What failure looks like
 *
 * - **Unwired** (hook removed from the options, or overridden later): no
 *   error, events keep flowing, and the raw URLs — invite tokens, filter
 *   amounts — reappear in PostHog's URL / pathname / referrer columns. Only
 *   the guardrail test notices.
 * - **Failing closed** (the hook throws internally): it returns `null`, which
 *   makes PostHog drop the event. Still no error anywhere — the symptom is
 *   event volume, `$pageview` included, sliding towards 0 in PostHog. PostHog
 *   rethrows from `before_send` into `capture()`, so catching here is also
 *   what keeps a sanitizer bug from breaking the calling component.
 */
export const scrubAnalyticsUrls: BeforeSendFn = (event) => {
  if (!event) return null
  try {
    if (event.event === '$snapshot') return event
    const scrubbed: CaptureResult = {
      ...event,
      properties: scrubContainer(event.properties) as CaptureResult['properties'],
    }
    if ('$set' in event) {
      scrubbed.$set = scrubContainer(event.$set) as CaptureResult['$set']
    }
    if ('$set_once' in event) {
      scrubbed.$set_once = scrubContainer(event.$set_once) as CaptureResult['$set_once']
    }
    return scrubbed
  } catch {
    return null
  }
}

/** PostHog's referrer value for "no referrer"; not a URL. */
const DIRECT_REFERRER = '$direct'
/** Deeper than any event PostHog builds; past this we stop and redact. */
const MAX_DEPTH = 32
const TRUNCATED = '[truncated]'
const CIRCULAR = '[circular]'

function isUrlKey(key: string): boolean {
  const k = key.toLowerCase()
  return k.endsWith('url') || k.endsWith('pathname') || k.endsWith('referrer') || k === 'attr__href'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function scrubContainer(value: unknown): unknown {
  return scrubValue(value, '', new WeakSet<object>(), 0)
}

function scrubValue(value: unknown, key: string, ancestors: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') {
    if (key === '$elements_chain') return scrubElementsChain(value)
    if (isUrlKey(key) && value !== DIRECT_REFERRER) return sanitizeAnalyticsUrl(value)
    return value
  }
  const isArray = Array.isArray(value)
  if (!isArray && !isPlainObject(value)) return value
  const container = value as object
  if (ancestors.has(container)) return CIRCULAR
  if (depth >= MAX_DEPTH) return TRUNCATED
  ancestors.add(container)
  try {
    if (isArray) {
      // Array items inherit the parent key, so `some_url: ['…']` is covered.
      return (value as unknown[]).map((item) => scrubValue(item, key, ancestors, depth + 1))
    }
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const keysAreUrls = key === '$heatmap_data'
    for (const childKey of Object.keys(source)) {
      const scrubbedChild = scrubValue(source[childKey], childKey, ancestors, depth + 1)
      if (!keysAreUrls) {
        out[childKey] = scrubbedChild
        continue
      }
      const urlKey = sanitizeAnalyticsUrl(childKey)
      const existing = out[urlKey]
      out[urlKey] =
        Array.isArray(existing) && Array.isArray(scrubbedChild)
          ? [...existing, ...scrubbedChild]
          : scrubbedChild
    }
    return out
  } finally {
    ancestors.delete(container)
  }
}

/**
 * `$elements_chain` is PostHog's serialized element path, e.g.
 * `a.nav:attr__href="/invite/abc"href="/invite/abc"nth-child="1"`.
 * Values are quoted with `"` escaped as `\"` (`escapeQuotes` in
 * `posthog-js/lib/src/autocapture-utils.js`).
 */
// No lookbehind for the "starts an attribute name" check: older iOS WebKit
// cannot parse it, and a regex SyntaxError would take the whole analytics
// module down with it. The preceding character is checked by offset instead
// (a consumed lead character would also swallow the closing quote that the
// next `href="` needs).
const CHAIN_HREF_RE = /((?:attr__)?href)="((?:\\.|[^"\\])*)"/g
const CHAIN_HREF_START_RE = /(?:attr__)?href="/g
const ATTR_NAME_CHAR_RE = /[A-Za-z0-9_-]/

function startsAttribute(chain: string, offset: number): boolean {
  return offset === 0 || !ATTR_NAME_CHAR_RE.test(chain[offset - 1])
}

function scrubElementsChain(chain: string): string {
  let rewritten = 0
  const out = chain.replace(
    CHAIN_HREF_RE,
    (match: string, name: string, quoted: string, offset: number) => {
      if (!startsAttribute(chain, offset)) return match
      rewritten++
      const href = quoted.replace(/\\"/g, '"')
      const clean = sanitizeAnalyticsUrl(href).replace(/"/g, '\\"')
      return `${name}="${clean}"`
    },
  )
  // An href whose closing quote cannot be found (e.g. a value ending in a
  // bare backslash, which `escapeQuotes` leaves ambiguous) would not match
  // above and would pass through raw. Fail closed: the outer catch drops the
  // event.
  let expected = 0
  for (const m of chain.matchAll(CHAIN_HREF_START_RE)) {
    if (startsAttribute(chain, m.index)) expected++
  }
  if (rewritten !== expected) {
    throw new Error('unparseable $elements_chain href')
  }
  return out
}

/**
 * #1267 — the PostHog options that keep ledger content out of third-party
 * analytics. Split out of `app/providers.tsx` so the guardrail test
 * (`tests/posthog-ledger-masking.test.ts{,x}`) can initialize a real PostHog
 * instance with *exactly* the options production ships, instead of a
 * hand-copied approximation that drifts the first time someone edits the
 * provider.
 *
 * ## What was wrong
 *
 * Autocapture is on by default (verified in
 * `node_modules/posthog-js/lib/src/posthog-core.js` → `autocapture: true`), and
 * `mask_all_text` / `mask_all_element_attributes` both default to `false`. With
 * those defaults every `$autocapture` event carries:
 *
 * - `$el_text` — the click target's text. For a `<button>`/`<a>` target that is
 *   `getDirectAndNestedSpanText()`: the element's own text nodes *plus* every
 *   nested `<span>`. For anything else it is `getSafeText()`: the element's own
 *   text nodes.
 * - `$elements_chain` — the same `text="…"` for every autocapture-compatible
 *   ancestor, so the parent row's text rides along even when the click landed
 *   on a child.
 * - `attr__<name>` for every attribute, `aria-label` included.
 *
 * The dashboard is built out of tappable rows that render exactly that: the
 * transaction description sits in a `<span>` inside `CompactRow`'s `<button>`,
 * and the amount sits in a `<div>` inside the same button (a `<div>` inside a
 * useful parent is autocaptured too — `shouldCaptureDomEvent()` returns true
 * via `parentIsUsefulElement`, and independently for anything whose computed
 * `cursor` is `pointer`). So tapping a row could ship the description, and
 * tapping the amount could ship the amount, to a third party — while
 * `privacyPage` claimed "no third-party analytics tracking financial data".
 *
 * `person_profiles: 'identified_only'` and `persistence: 'memory'` do not help:
 * they stop PostHog building a *person* out of the events. The event payload is
 * unaffected.
 *
 * ## Why masking rather than `ph-no-capture`
 *
 * `ph-no-capture` is per-element and drops the whole event (`explicitNoCapture`
 * → `_captureEvent` returns `false`), so it costs more analytics than masking
 * *and* has to be remembered on every new component. Masking is global: a
 * component added next year is covered without anyone thinking about it. What
 * survives is the interaction skeleton — tag, classes, position in the chain,
 * `$current_url`, and `attr__href` for links (href is assigned outside the
 * attribute-mask guard, so link analysis still works).
 *
 * Nothing is lost on the explicit side: `mask_all_text` /
 * `mask_all_element_attributes` are read only by autocapture and dead-click
 * autocapture. The ~18 named `track()` events and the manual `$pageview` are
 * untouched, which is where this repo's analysis has lived since #1015
 * deliberately replaced `$el_text` reverse-engineering with named events.
 *
 * ## Failure mode if these come off
 *
 * Nothing breaks. No error, no warning, no visible change — events keep
 * flowing and simply start carrying descriptions and amounts again. The only
 * place it shows is the `$el_text` column of a PostHog event nobody has a
 * reason to open. That is what the guardrail test exists for.
 */
export const POSTHOG_PRIVACY_OPTIONS = {
  /**
   * Explicit, though `true` is also the default. Stated so that the choice to
   * keep autocapture is visible next to the masking that makes it safe —
   * reading `providers.tsx` should not require knowing a library default.
   */
  autocapture: true,
  /** Drops `$el_text` and every `text="…"` in `$elements_chain`. */
  mask_all_text: true,
  /**
   * Drops `attr__*`. Needed on top of `mask_all_text` because several rows
   * put ledger content in an attribute rather than in text: `BalanceHero`'s
   * settle button, the drill-down bars in `MonthlyStatsBars` (asset name),
   * `ActiveTripBanner` (trip name). `attr__href` is exempt inside PostHog, so
   * outbound-link analysis is unaffected.
   */
  mask_all_element_attributes: true,
  /**
   * Session replay would record the rendered ledger — every description and
   * amount on screen, which is strictly worse than the autocapture leak this
   * fixes. It is off by default *server-side*, but the SDK default is
   * `disable_session_recording: false`, so a single toggle in the PostHog
   * project UI would start recordings with no code change and no notice here.
   * Pinning it client-side makes that toggle a no-op.
   *
   * If replay is ever wanted, this line comes off *together with* replay-side
   * masking (`session_recording.maskAllInputs` + `maskTextSelector: '*'`) —
   * the options above do not apply to the recorder.
   */
  disable_session_recording: true,
  /**
   * #1274 — `/flags` is a request, not an event, so `before_send` never sees
   * it. posthog-js (1.374.3, `_callFlagsEndpoint` in
   * `posthog-featureflags.js`) posts `person_properties:
   * persistence.get_initial_props()` with it, and those `$initial_current_url`
   * / `$initial_pathname` / `$initial_referrer` are built from the raw
   * `location.href` / `document.referrer` (`getPersonInfo` in
   * `utils/event-utils.js`) — invite token and filter values included. It
   * fires once remote config loads (unless the project reports
   * `hasFeatureFlags: false`) and again on the 5-minute refresh interval
   * (`remote-config.js` → `refresh()`).
   *
   * We use no feature flags, so flags are switched off. This option makes
   * `reloadFeatureFlags()` return before anything is scheduled, and both the
   * first-load path (`ensureFlagsLoaded()`) and the refresh go through it; the
   * only other caller of `_callFlagsEndpoint` is the retry inside a request
   * that can no longer start.
   *
   * Not `advanced_disable_flags`: despite the name, that one also skips the
   * remote-config load (`_shouldDisableFlags()` in `remote-config.js`), which
   * is how the project's server-side settings reach the SDK (autocapture
   * opt-out, heatmaps, web vitals, …). Turning those into client-only
   * defaults is a much wider change than dropping flags we never read.
   *
   * The raw initial URL still sits in PostHog's persistence for the life of
   * the page. With `persistence: 'memory'` (set in `providers.tsx`) that is
   * JS memory only — no cookie, no storage — and nothing reads it for the
   * network except this request.
   *
   * If this comes off, nothing errors: every page load (and every 5 minutes
   * after) posts the raw landing URL and referrer to `/flags`, a request that
   * PostHog does not show as an event anywhere. Only the `/flags` case in
   * `tests/posthog-ledger-masking.test.tsx` notices.
   */
  advanced_disable_feature_flags: true,
  /**
   * #1274 — URL scrubbing; see `scrubAnalyticsUrls` above. Lives here, not in
   * `providers.tsx`, so the guardrail test runs the exact hook production
   * ships and the "no literal re-declaration" check covers it too.
   */
  before_send: scrubAnalyticsUrls,
} satisfies Partial<PostHogConfig>

/**
 * The option names above, for the source-level half of the guardrail. Kept
 * next to the object so the two cannot drift apart.
 */
export const POSTHOG_PRIVACY_OPTION_NAMES = Object.keys(
  POSTHOG_PRIVACY_OPTIONS,
) as (keyof typeof POSTHOG_PRIVACY_OPTIONS)[]
