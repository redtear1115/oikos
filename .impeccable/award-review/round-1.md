# Round 1 — 2026-10-03

```
Round: 1   Rubric: v2   Overlay: .impeccable/award-rubric.md   Reviewer: fresh pilotfish:verifier   Build: 1c94e1f (prod build, local :3100)
Gates: G1 FAIL  G2 pass  G3 pass  G4 pass  G5 pass  WCAG manual FAIL (targets < 44 px, no-JS CTA dead, forced-colors button edges)
D 5.92   U 6.25   C 6.17   T 7.25   Weighted 6.20   Min D 5.92   FAIL (score + gate)
```

## Gates

| Page | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| landing | 87 | 100 | 96 | 100 | **3.97 s** (prod 6.48 s) | 0.002 | 46 ms |
| sign-in | 96 | 100 | 96 | 100 | **2.70 s** (prod 3.02 s) | 0.022 | 92 ms |
| use-case | 92 | 100 | 96 | 100 | **3.29 s** (prod 5.81 s) | 0 | 41 ms |
| use-case/cohabitation | 98 | 100 | 96 | 100 | 2.41 s | 0 | 37 ms |
| migrate | 98 | 100 | 96 | 100 | 2.26 s | 0 | 78 ms |
| migrate/honeydue | 97 | 100 | 96 | 100 | 2.41 s | 0 | 84 ms |
| migrate/cwmoney | 97 | 100 | 96 | 100 | 2.40 s | 0 | 82 ms |

Landing LCP element = mobile hero illustration (`IllustrationSlot`); load 67 ms but **element render delay 2.2 s** (prod trace). G2: prod 0 console errors; no CSP header is set. Local pageerrors come from `/_vercel/*insights/script.js` 307 → HTML (local artefact).

## Scores

| Check | Score | Anchor note |
|---|---|---|
| D1 World coherence | 6.0 | Landing has the world; inner pages = cream + watermark + generic white card grids |
| D2 Typography | 5.5 | Breaks: 「資/料」 honeydue H1, 「怎麼/記才」 use-case H1, 「保單，」「什/麼。」 orphans, en hero hard `<br>`, ja 「ありませ/ん。」, footer 「日本語」 vertical, synthetic italic on CJK |
| D3 Colour & light | 6.5 | Palette holds; inner-page cards all equal weight |
| D4 Composition | 6.0 | Inner pages = widened phone column; dead band at 1440; landscape hero sliver |
| D5 Illustration | 6.0 | One good hero, nothing else |
| D6 Motion | 5.5 | Landing has no motion; sign-in two unrelated keyframes |
| U1 Primary task | 7.0 | Clear first screen, 2 taps to Google/Apple; CTA blank until hydration, dead without JS |
| U2 Wayfinding | 6.0 | No breadcrumbs; 回首頁 md+ only; sign-in has no way home |
| U3 Affordance | 6.5 | Hover = opacity only; use-case cards no hover |
| U4 A11y in use | 6.0 | Focus visible; no skip link, footer/legal links 16–20 px tall, Ko-fi iframe focus invisible |
| U5 Robustness | 6.0 | No overflow; footer wrap, landscape, forced-colors buttons lose edges |
| U6 Perceived perf | 6.0 | No jank; LCP slow, CTA label blank ~2 s |
| C1 Concept | 6.0 | "Records → points of light" only in the hero art and 「四種光」 heading |
| C2 Signature moments | 6.0 | One: hero + phone |
| C3 State | 6.0 | Platform-aware CTA, rotating story; nothing staged |
| C4 Domain specificity | 7.0 | PTT, AA制, CWMoney/麻布 guides, ふたり, MADE IN TAIWAN |
| C5 Tech inventiveness | 6.0 | No View Transitions / scroll-driven / `@property` |
| C6 Overall | 6.0 | Nothing shareable |
| T1 Voice | 7.5 | Good microcopy; sign-in title uses 「開始」 |
| T2 Depth | 7.5 | Comparison-table bug |
| T3 Newcomer | 7.5 | CTA blank on first paint |
| T4 Media | 6.5 | Inner pages have no media |

Reviewer's ceiling estimate: all polish fixes land → ~7.1. Reaching 7.5 needs the concept to carry a structure (signature moment), not polish alone.

## Bugs

1. **P2** Migrate comparison table doubles marks (「✓ ✓ 支援」「◐ △ 基本對半」「— ✕ 無」): `MigrateComparison.tsx` prepends `TONE_GLYPH`, labels already carry ✓/✕/△. All sources.
2. **P2** Landing CTAs blank + inert before hydration, dead without JS (deliberate, see `LandingPrimaryCta.tsx` comment; owner question).
3. **P3** Ko-fi widget overlaps 「01」 row at 1440, en H2, landscape hero.
4. **P3** Footer language links wrap vertically at 390.
5. **P3** Footer/legal/「看全部」 links under 44 px tall.
6. **P3** CJK/en line breaks (see D2).
7. **P3** Sign-in has no link home.
8. **P3/P4** Sign-in title/meta 「開始」; forced-colors buttons borderless.

## Top fixes (reviewer ranking, est. weighted gain)

1. In-world inner pages — hairline lists instead of card grids, light-point markers, one lamp-light vignette per page (+0.22)
2. Point-of-light motion system — one easing token, scroll-driven "lamp comes on", cross-doc View Transition landing → sign-in, reduced-motion branch (+0.15)
3. Concept carries a structure — phone-mockup records emit light points into the hero ribbon; 「四種光」 rows lit as four lights (+0.13)
4. CJK/Latin line-break pass (+0.10)
5. CTA SSR label + LCP fix (+0.10, unblocks G1)
6. Wayfinding (+0.05) · 7. A11y hardening (+0.05) · 8. Ko-fi placement (+0.06) · 9. Hover affordance (+0.05) · 10. Table bug (+0.03)
