# Round 3 — 2026-10-04

```
Round: 3   Rubric: v2   Overlay: .impeccable/award-rubric.md@26f5d10   Reviewer: fresh pilotfish:verifier (Playwright, bundled Chromium + WebKit, no sign-in)
Build: PRODUCTION https://futari.southern-light.dev/ (origin/main c11ba45; prod serves the 222b50a copy and the 4194eaf row CSS)
Gates: G1 FAIL (LCP unstable: landing root + sign-in medians ~4.2 s)  G2 pass  G3 pass  G4 pass (advisory)  G5 pass  WCAG manual pass (one 2.4.7 finding)
D 6.58   U 7.17   C 6.33   T 7.75   Weighted 6.83   Min C 6.33   FAIL (score + gate)
Δ vs round 2: D +0.25, U +0.17, C 0, T 0, weighted +0.15 (round 2 projected ~6.91)
```

This round was scored against production, not a local build (round 1 and 2 used a local prod build on :3100), because the round fed a brand film made from the live site.

## Gates

### G1 (Lighthouse, mobile, default throttling, production)

| Page | Perf | A11y | BP | SEO | LCP (median) | CLS | TBT | LCP runs |
|---|---|---|---|---|---|---|---|---|
| landing `/` | 83 | 100 | 100 | 100 | **4.18 s** | 0.003 | — | 2.04, 4.18, 4.21 |
| landing `/zh-TW` | 99 | 100 | 100 | 92 | 2.12 s | 0.003 | 50 ms | 4.23, 2.12, 2.12 |
| sign-in | 82 | 100 | 100 | 100 | **4.18 s** | 0.023 | 43 ms | 4.18, 1.97, 4.18, 1.67, 4.06, 4.07 |
| use-case | 99 | 100 | 100 | 100 | 2.00 s | 0 | 92 ms | 2.01, 2.00, 1.94 |
| use-case/cohabitation | 100 | 100 | 100 | 100 | 1.91 s | 0 | 26 ms | 4.03, 1.91, 1.89 |
| migrate | 99 | 100 | 100 | 100 | 2.09 s | 0 | 16 ms | 4.20, 2.09, 2.09 |
| migrate/honeydue | 99 | 100 | 100 | 100 | 1.98 s | 0 | 23 ms | 1.98, 1.98, 1.98 |
| migrate/cwmoney | 99 | 100 | 100 | 100 | 1.98 s | 0 | 26 ms | 4.09, 1.98, 1.98 |

- **LCP is bimodal on every page: ~2.0 s or ~4.2 s.** Landing root and sign-in land on the slow side in most runs, so their medians fail. Sign-in was run 6 times.
- **Slow runs:**
  - Landing: element render delay ≈ 1.0 s on the mobile hero `picture > img`, against 52 ms in a fast run.
  - Sign-in: the LCP element is the `h1 > a` wordmark, with render delay 1.3 s against 0.28 s.
  - Same class of cause as round 1 (#1520). Not diagnosed further here.
- **`/zh-TW` SEO 92 is an artefact of the URL tested.** Its canonical points to `/`, which Lighthouse flags. The root scores 100.
- **Best Practices is 100 on prod**, against 96 in rounds 1–2 locally.

### G2–G5 and WCAG manual

- **G2 pass.**
  - Tested 7 pages × 2 viewports: scroll, open every `<details>`, row hover, 25 Tabs, then a 3 s wait for the idle-loaded SDKs and Ko-fi.
  - Result: 0 `securitypolicyviolation`, 0 console errors, 0 page errors, 0 responses ≥ 400.
  - The pass says little, because brand pages send no CSP at all. `frame-ancestors 'none'` (2f82fb5) is set only on signed-in routes.
- **G3 pass.**
  - With reduced motion, `getAnimations()` is empty after load on all 7 pages at both widths.
  - The only entries are Ko-fi's 0.6 s transitions on 0×0, opacity-0 containers.
- **G4 pass, advisory A2.**
  - At 4× CPU: landing scroll had 0 long tasks and 60 fps; use-case row hover had 0 long tasks and 60 fps.
  - Sign-in fade: 60 fps median, but long tasks of 52–77 ms land inside its window. Compositor-only, not a signature motion.
- **G5 pass:** width sweep 320–1920 in 10 px steps, 0 overflow.
- **P1 recheck: fixed (Chromium + WebKit).**
  - `.bi-link` rows are ≤ 135 px at 320, ≤ 112 px at 390, 88 px at 768 and 61 px at 1440.
  - Round 2 had 588–635 px.
- **WCAG manual:**
  - 2.4.11 pass (partial overlaps only: the 1440 header CTA under the phone mockup).
  - 2.5.8 pass (cwmoney 「下載轉換模板」 is 106×20, under the project's 44 px bar).
  - 1.4.11 pass.
  - The no-JS render works on all 7 pages.

## Findings

- **F1 (P2): the CSV upload box has no visible keyboard focus (2.4.7)** on migrate/honeydue and migrate/cwmoney.
  - `input[type=file].sr-only` takes focus, but the `<label>` keeps `outline-style: none` and no box-shadow (`components/CsvFileUploadWidget.tsx:71`).
  - The file is unchanged since round 2, so rounds 1–2 missed this.
  - Recheck: Tab to the input and confirm a ring of at least 3:1 on the label.
- **F2 (P3): zh-TW body and row text breaks mid-word at 320/390/1440.**
  - Chromium applies `word-break: auto-phrase` only to `lang=ja`.
  - Examples: 隨時匯/出, 群組交/易, App → 設/定, 能見/度, 搬遷指/南; at 320, dev-log titles 我拒/絕, 系/統.
  - ja is clean.
- **F3 (P3, carried): at 1440 the phone mockup overlaps the bottom edge of the landing header CTA.**
- **Advisories:**
  - A1: no CSP on brand pages.
  - A2: long tasks during the sign-in fade (b140c1a touched `useSignedInRedirect.ts`; no baseline to compare).
  - A3: the brand focus ring (#e08856 at 55 %) is about 1.45:1 on #efddc4, so it would fail 1.4.11 outside the skip link.
  - A4: the 20 px template link.

## Scores

| Check | R2 | R3 | Note |
|---|---|---|---|
| D1 World | 7.0 | 7.0 c | Honeydue intro/CTA cards and landing migrate cards are still white cards |
| D2 Type | 6.5 | 7.0 | P1 gone; en and ja clean; zh-TW in-word splits keep it below 8 (F2) |
| D3 Colour & light | 7.0 | 7.0 c | |
| D4 Composition | 5.5 | 6.5 | Phone rows compose again; CTA/mockup overlap and inner-page cards remain |
| D5 Illustration | 6.5 | 6.5 c | |
| D6 Motion | 5.5 | 5.5 c | |
| U1 Primary task | 7.5 | 7.5 c | |
| U2 Wayfinding | 7.5 | 7.5 | One home label and the centred breadcrumb root confirmed; polish within the anchor |
| U3 Affordance | 7.0 | 7.0 c | |
| U4 A11y in use | 7.5 | 7.0 | Skip-link ring landed; F1 breaks the full keyboard pass; 20 px template link |
| U5 Robustness | 5.0 | 6.5 | No breakage at 320/390/768/1440; long content, empty/error states and slow 3G not exercised |
| U6 Perceived perf | 7.5 | 7.5 c | Carried; G1's bimodal LCP is a reason to look again next round |
| C1–C6 | 6.5 / 6.0 / 6.0 / 7.0 / 6.5 / 6.0 | same, c | Phase B (#1527) not done |
| T1 Voice | 8.0 | 8.0 | 管理/追蹤/track/manage cleanup is live; en CTA "Start your ledger for free" |
| T2 Depth | 8.0 | 8.0 c | |
| T3 Newcomer | 8.0 | 8.0 | |
| T4 Media | 7.0 | 7.0 c | |

## Top fixes, ranked by weighted gain

1. **G1 first:** find why LCP flips between ~2.0 and ~4.2 s on prod (landing hero `img`, sign-in wordmark). The round fails on the gate whatever the score.
2. **Phase B point-of-light signature (#1527):** about +0.22. It's the only route to C ≥ 7.0.
3. **De-card and recompose (D4, D1):** about +0.10.
4. **zh-TW phrase segmentation for body and row text (D2):** about +0.07.
5. **Dropzone focus ring and a 44 px template link (F1):** about +0.03 to +0.05.
6. **U5 robustness pass** (landscape, 200 % zoom, long and emoji content, slow 3G): about +0.03 to +0.05.

Fixes 2–6 come to about 7.3. Reaching 7.5 also needs D5 and C2 to reach about 7.

## Owner questions

- U1 on phones (still open): a mobile UA sees 「在 App Store 下載」. Should U1 be worded per platform?
- en sign-in's "…without losing track?" is an idiom, not the banned verb. Keep it?
- en sign-in shows its dev-log entries in zh-TW (e.g. 「分開以後，舊的日子留著…」). Intended?
- Brand pages have no CSP beyond Vercel's defaults. Is that acceptable, given G2 can't really fail without one?
