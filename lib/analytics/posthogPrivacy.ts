import type { PostHogConfig } from 'posthog-js'

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
} satisfies Partial<PostHogConfig>

/**
 * The option names above, for the source-level half of the guardrail. Kept
 * next to the object so the two cannot drift apart.
 */
export const POSTHOG_PRIVACY_OPTION_NAMES = Object.keys(
  POSTHOG_PRIVACY_OPTIONS,
) as (keyof typeof POSTHOG_PRIVACY_OPTIONS)[]
