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

- Sign-in page carries a long story block + 「開發日誌」 list below the buttons. Keep, trim, or move? (Not deducted until answered.)
- Landing CTA is blank + inert until hydration (and dead without JS) because its destination is platform-dependent (shell → sign-in, never App Store; iPhone browser → App Store; Android → beta form). Accept an SSR'd sign-in default that is re-pointed after hydration? Touches a native-contract file (`Landing.tsx` family) → real-device check needed.
- U1 wording assumes desktop → sign-in; on phone browsers the CTA goes to App Store / beta form. Re-word U1 per platform?
- Use-case CTA says 「免費開始記帳」; sign-in `<title>`/meta say 「開始兩個人的記帳生活」 (sign-in bans 「開始」). Intended?
- Ko-fi widget: OK to reposition / hide while it overlaps hero and feature rows on brand pages?

## Decisions log

- 2026-10-03: scope = landing + sign-in + use-case + migrate; direction = Warm Lamp deepened; brand pages unfrozen, dashboard frozen; purpose = trust + CTA conversion. (owner)

## Rounds

| Round | Date | Commit | Gates | D | U | C | T | Weighted | Result |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-03 | 1c94e1f | G1 FAIL (LCP landing 3.97 s local / 6.48 s prod; use-case 3.29 s; sign-in 2.70 s); G2–G5 pass | 5.92 | 6.25 | 6.17 | 7.25 | 6.20 | FAIL — [round-1.md](award-review/round-1.md) |
