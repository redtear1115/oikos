# Award-review overlay — Futari pre-login brand pages

Overlay for the `award-review` skill (rubric v2). Created 2026-10-03 with the owner.

## Goal

Upgrade the product image of the pre-login pages. Direction: **"Warm Lamp, deepened"** — keep the existing palette, Fraunces + Noto Sans TC pairing and the hero illustration world; brand-surface-only motion, composition and type steps are allowed. The concept to push: *records become points of light that form a shared life spectrum* (PRODUCT.md › Product Purpose).

Purpose is conversion with trust, not award submission: a stranger arriving from search should trust Futari and press 「一起記錄」.

## Scope

| Page | URL (zh-TW is primary; spot-check en + ja for D2) |
|---|---|
| Landing | `/zh-TW` |
| Sign-in | `/zh-TW/sign-in` |
| Use-case index + one detail | `/zh-TW/use-case`, `/zh-TW/use-case/cohabitation` |
| Migrate index + two details | `/zh-TW/migrate`, `/zh-TW/migrate/honeydue` (CSV export source), `/zh-TW/migrate/cwmoney` |

Out of scope: `/privacy`, `/terms` (typography only, not scored), everything behind sign-in (`app/(dashboard)`, onboarding, setup, invite), native shells.

Not time-driven: no clock states. No data fixture (public pages are static). Viewports per protocol: 390×844 DPR 3, 1440×900.

## Project wording for checks

- **U1 primary task**: within the first screen, a stranger can say what Futari is (a shared ledger for two) and reach 「一起記錄」 → sign-in → Google/Apple in ≤ 2 taps.
- **D1 world**: the Warm Lamp world = committed cream ground (`--bg-committed`), lamp light / floating light points, Fraunces display voice. Every scoped page needs at least one in-world structure; generic cards/lists count against it.
- **C3 real time / state**: realistic expectation is light that responds to state (e.g. records → points of light), not a live clock. Do not demand time-of-day theming.
- **SEO**: pages are meant to be indexed → G1 SEO is gated at ≥ 95.

## Must NOT be penalised (settled owner decisions and constraints)

- Light-only (no dark mode). PRODUCT.md records it as a known gap, and ad-hoc dark variants are banned until scoped.
- Apple sign-in button is pure black: Apple HIG requirement.
- Sign-in is Google + Apple only; no email/password, no "try without account".
- Ko-fi "請喝杯咖啡" widget on web (hidden on iOS by design). Its *position* overlapping content is fair game; its existence is not.
- Copy rules (CLAUDE.md › 品牌文案準則): no exclamation marks, no conversion language on sign-in (「開始」「立即」「免費試用」), trust-row order 免費 → 裝置 → 隱私, no encryption claims beyond what holds (#1191), no 管理/追蹤/監控.
- Native scroll only (no scroll-jacking / smooth-scroll libraries); motion must have a reduced-motion branch; WebView honesty (PRODUCT.md › Platform Constraints).
- Static, CSP-safe, no WebGL/Three.js; motion only via CSS / WAAPI / scroll-driven animation.
- Hero illustration style and subject (two people on a sofa under a lamp, #832) stay. A commissioned replacement may come later; scoring judges how it is used, not that it exists.
- Token discipline: even-px type, existing tokens first. New tokens are allowed **only on brand surfaces** and only when the existing scale can't express the design — each one is listed in the round's fix log.
- Dashboard stays under the visual freeze; fixes must not leak into `app/(dashboard)`.

## Owner questions (open)

- U1 wording assumes desktop → sign-in; on phone browsers the CTA goes to App Store / beta form. Re-word U1 per platform?
- en use-case CTA "Start tracking for free" and ja landing 「家計管理ツール」 contain the app-banned 追蹤/管理. Acceptable on brand pages?

## Decisions log

- 2026-10-03: scope = landing + sign-in + use-case + migrate; direction = Warm Lamp deepened; brand pages unfrozen, dashboard frozen; purpose = trust + CTA conversion. (owner)
- 2026-10-03 (after round 1): fix in two phases — A = bugs, LCP/G1, line breaks, a11y, wayfinding, de-carding inner pages (one PR); B = point-of-light signature concept, prototype first and owner decides before shipping. Landing CTA: SSR a labelled sign-in default, re-point after hydration (native-contract file → real-device check). Sign-in story + dev log: keep content, restyle as hairline list, shorten. Ko-fi on brand pages: appears only after scrolling past the hero, with clearance from content. (owner)
- 2026-10-03 (#1520): LCP root cause = Lantern charges the JS chain (Sentry + PostHog + Supabase, ~600 KB raw) and the Fraunces font chain to text LCP. Blocking all three → LCP 2.40 s / P98 stable on landing and sign-in; any one alone is not enough. Owner: defer all three until after first paint (idle) **on brand pages only**; dashboard unchanged. (owner)
- 2026-10-03 (#1520): accepted consequence — brand-page PostHog pageviews from visitors who leave before the SDK loads are lost (pageview/bounce discontinuity; GA unaffected). Owner: 「沒關係 效能重要」.
- 2026-10-03: Ko-fi pill icon-only at every width (accessible label kept) — owner OK. en/ja migrate comparison table fully translated, folded into phase A (#1538). Use-case CTA 「免費開始記帳」 stays. (owner)

## Issues (v1.6.7)

Tracker #1528. Phase A: #1519 table marks, #1520 LCP/G1, #1521 CTA pre-hydration, #1522 line breaks, #1523 a11y + wayfinding, #1524 de-card inner pages, #1525 Ko-fi placement, #1526 sign-in copy, #1538 comparison table i18n. Phase B: #1527 point-of-light prototype.

## Rounds

| Round | Date | Commit | Gates | D | U | C | T | Weighted | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-03 | 1c94e1f | G1 FAIL (LCP landing 3.97 s local / 6.48 s prod; use-case 3.29 s; sign-in 2.70 s); G2–G5 pass | 5.92 | 6.25 | 6.17 | 7.25 | 6.20 | FAIL — [round-1.md](award-review/round-1.md) |
| 2 | 2026-10-03 | 681655e | all pass (LCP 2.11–2.47 s) | 6.33 | 7.00 | 6.33 | 7.75 | 6.68 | FAIL — [round-2.md](award-review/round-2.md); P1 row bug fixed after (projected ~6.91) |
| 3 | 2026-10-04 | c11ba45 (prod) | G1 FAIL (LCP bimodal ~2.0/~4.2 s; landing root + sign-in medians 4.18 s); G2–G5 pass | 6.58 | 7.17 | 6.33 | 7.75 | 6.83 | FAIL — [round-3.md](award-review/round-3.md); scored on production |
