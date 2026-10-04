# Round 2 — 2026-10-03

```
Round: 2   Rubric: v2   Overlay: .impeccable/award-rubric.md   Reviewer: fresh pilotfish:verifier   Build: 681655e (prod build, local :3100)
Gates: G1 pass  G2 pass  G3 pass  G4 pass  G5 pass  WCAG manual pass (targets, skip link, no-JS CTA, forced-colors)
D 6.33   U 7.00   C 6.33   T 7.75   Weighted 6.68   Min D/C 6.33   FAIL (score)
Δ vs round 1: D +0.41, U +0.75, C +0.17, T +0.50, weighted +0.48
```

## Gates (build 681655e)

| Page | Perf | A11y | BP | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| landing | 98 | 100 | 96 | 100 | 2.47 s (round 1: 3.97 s local, 6.48 s prod) | 0.003 |
| sign-in | 99 | 100 | 96 | 100 | 2.11 s | 0.023 |
| use-case | 98 | 100 | 96 | 100 | 2.31 s | 0 |
| use-case/cohabitation | 98 | 100 | 96 | 100 | 2.31 s | 0 |
| migrate | 98 | 100 | 96 | 100 | 2.47 s | 0 |
| migrate/honeydue | 98 | 100 | 96 | 100 | 2.47 s | 0 |
| migrate/cwmoney | 98 | 100 | 96 | 100 | 2.47 s | 0 |

Landing and migrate pass with about 30 ms of margin. Lighthouse's simulated LCP moves in steps of roughly 0.15 s, so a small increase in render-blocking CSS or HTML bytes can push them over 2.5 s.

## Scores

| Check | R1 | R2 | Note |
|---|---|---|---|
| D1 World | 6.0 | 7.0 | Every inner page now has one lamp structure plus ember markers. Leftover generic cards: Honeydue intro/CTA, the landing migrate cards. The use-case and migrate hubs share a template. |
| D2 Type | 5.5 | 6.5 | 0 in-word heading breaks (chromium + webkit). Held back by the P1 row bug. |
| D3 Colour & light | 6.5 | 7.0 | The glow stages each page head. |
| D4 Composition | 6.0 | 5.5 | Real 1440 composition, but phone rows were broken (P1). |
| D5 Illustration | 6.0 | 6.5 | Hero art reused as the sign-in window strip; ribbon and glow added. |
| D6 Motion | 5.5 | 5.5 | carried |
| U1 Primary task | 7.0 | 7.5 | SSR CTA is labelled and clickable without JS. |
| U2 Wayfinding | 6.0 | 7.5 | Breadcrumbs, a home link from sign-in, a skip link. |
| U3 Affordance | 6.5 | 7.0 | Row hover and press states; the `<details>` opens. |
| U4 A11y in use | 6.0 | 7.5 | Skip link comes first; all targets ≥ 44 px; forced-colors edges. |
| U5 Robustness | 6.0 | 5.0 | P1 row collapse at 320/390/768. |
| U6 Perceived perf | 6.0 | 7.5 | LCP 2.11–2.47 s; CTA labelled at first paint. |
| C1 Concept | 6.0 | 6.5 | The light point appears as a marker everywhere, but as decoration, not structure. |
| C2 Signature | 6.0 | 6.0 | carried |
| C3 State | 6.0 | 6.0 | carried |
| C4 Domain | 7.0 | 7.0 | carried |
| C5 Tech | 6.0 | 6.5 | Intl.Segmenter phrase breaks, auto-phrase, color-mix, text-wrap. |
| C6 Overall | 6.0 | 6.0 | carried |
| T1 Voice | 7.5 | 8.0 | |
| T2 Depth | 7.5 | 8.0 | One mark per cell, comparison table in all 4 locales. |
| T3 Newcomer | 7.5 | 8.0 | |
| T4 Media | 6.5 | 7.0 | |

## Fixed after scoring (not re-scored)

- **P1** (4194eaf): below 1024 px, `.bi-link` had three grid tracks but four children, so the row description fell into the 24 px arrow track (one character per line, rows ~600 px tall). Now placed explicitly. Row height went from 588–635 px to ≤ 135 px at 390, chromium + webkit.
  - Why the gates missed it: G5 only checks horizontal overflow.
  - Reviewer's projection with this fixed: about **6.91**.
- **P4** (22f6a2e): one home label across use-case and migrate; centred breadcrumb root; brand focus ring on the skip link.

## Remaining

Phase A leftovers:
- Landing's three white migrate cards and the Honeydue intro/CTA cards are still cards.
  - The landing cards are deliberately deferred: the landing's LCP margin is ~30 ms.
- The landing header CTA overlaps the top edge of the phone mockup at 1440 (present since round 1).

Phase B (#1527), the reviewer's view:
- **Highest leverage:** records become light points that drift into the hero ribbon (C1, C2, D6, C5; about +0.25).
- 「四種光」 rows light up on scroll (+0.12).
- Cross-document View Transition from landing to sign-in (+0.08).
- Phase B is necessary but probably not sufficient for 7.5 (projected 7.3–7.4). D4 and D5 also need to reach about 7.0, for example by carrying the light-point motif into inner pages and filling the empty left rail on long lists at 1440.

## Owner questions

- U1 on phones: after hydration the CTA goes to the App Store or the beta form. Should U1 be worded per platform?
- The en use-case CTA says "Start tracking for free". "Tracking" maps to the banned 追蹤 in app copy. Is it acceptable on brand pages?
- The ja landing uses 「家計管理ツール」, which contains 管理. Same question.
