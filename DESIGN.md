---
name: Futari
description: A warm, two-person household ledger that feels like a lamp left on, not a spreadsheet.
colors:
  lamplit-cream: "#FBEDE0"
  committed-cream: "#EFDDC4"
  frame-sand: "#E8D5B8"
  surface-white: "#FFFFFF"
  surface-warm: "#FFF6EC"
  cocoa-ink: "#3A2419"
  cocoa-ink-2: "#7A5848"
  cocoa-ink-3: "#82654F"
  ember: "#E08856"
  ember-soft: "#F8D9C2"
  sage: "#7A9F7E"
  clay: "#D17561"
  destructive: "#B85A48"
  warning: "#B45309"
  sage-saving: "#5A7A66"
  saving-soft: "#DDE5DC"
  realtime-flash: "#FFFBE8"
  asset-house: "#CB9B79"
  asset-car: "#BDB290"
  asset-child: "#D7A1A6"
  asset-pet: "#D4AC79"
  asset-plant: "#9BBA8A"
  asset-insurance: "#9EB59B"
  asset-item: "#B7AAA0"
typography:
  display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  page:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  title:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.6px"
  mini:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.6px"
  button:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  amount:
    fontFamily: "-apple-system, 'SF Pro Display', system-ui"
    fontSize: "56px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  chip: "10px"
  bubble: "14px"
  tile: "18px"
  card: "20px"
  full: "9999px"
spacing:
  control-sm: "36px"
  control-md: "44px"
  control-lg: "52px"
  chip-h: "34px"
  sheet-x: "20px"
  sheet-y-top: "16px"
  sheet-y-bottom: "24px"
  bottom-nav-offset: "112px"
components:
  button-primary:
    backgroundColor: "{colors.cocoa-ink}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 20px"
    typography: "{typography.button}"
  button-accent:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 20px"
    typography: "{typography.button}"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cocoa-ink}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 20px"
    typography: "{typography.button}"
  button-ghost:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cocoa-ink-2}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 20px"
    typography: "{typography.button}"
  button-danger:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 20px"
    typography: "{typography.button}"
  button-disabled:
    backgroundColor: "{colors.cocoa-ink-3}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 20px"
    typography: "{typography.button}"
  chip-selected:
    backgroundColor: "{colors.cocoa-ink}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.chip}"
    height: "{spacing.chip-h}"
    padding: "0 14px"
    typography: "{typography.label}"
  chip-unselected:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cocoa-ink-2}"
    rounded: "{rounded.chip}"
    height: "{spacing.chip-h}"
    padding: "0 14px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cocoa-ink}"
    rounded: "{rounded.bubble}"
    height: "{spacing.control-md}"
    padding: "0 14px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cocoa-ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  sheet:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cocoa-ink}"
    rounded: "{rounded.card}"
    padding: "16px 20px 24px"
  switch-on:
    backgroundColor: "{colors.ember}"
    rounded: "{rounded.full}"
    width: "44px"
    height: "26px"
---

# Design System: Futari

## 1. Overview

**Creative North Star: "The Warm Lamp"**

Futari is a ledger that behaves like a lamp left on for two people. The light is present and warm; it witnesses the day without glaring at it. Everything in this system serves that feeling: a daily accounting chore reframed as companionship (陪伴式記錄框架), where each record is a small point of warm light and the running story matters more than any single number. The palette is hearth-toned, the surfaces sit flat and quiet, and the type carries an editorial calm rather than dashboard urgency.

The register is **product**: design serves the task. But the task is emotional, so restraint is the discipline, not coldness. Controls are confident and unhurried (refined and restrained), surfaces lean on hairlines and tonal warmth instead of drop shadows, and motion is a soft exhale, never a performance. Two gestures carry the system's signature. The first is the **dark-ink fill**: the primary commit button (記下 / 儲存 / 確認) is the firm anchor in a soft, cream-lit room. The second is the **realtime warm flash**: the pale-yellow pulse when the partner records something from somewhere else. One is the user acting; the other is being accompanied. Both earn their weight because everything around them is quiet.

The system runs on two grounds, not one. App surfaces sit on Lamplit Cream (`--bg`); brand surfaces (landing, sign-in, migrate, terms, privacy) sit on the deepened Committed Cream (`--bg-committed`) and let Fraunces speak at full voice. It also ships inside iOS and Android WebView shells, so it deliberately suppresses browser-document behavior (overscroll bounce, tap-highlight flash, visible scrollbars) to stop the shell from feeling like a web page in a frame.

This system explicitly rejects the things a money app reflexively becomes. No cold fintech gravitas (navy-and-gold, dense grids, "wealth management" weight). No hype-SaaS costume (purple gradients, decorative glass, big-number hero metrics, exclamation marks). No surveillance framing (the words 管理 / 追蹤 / 監控 are banned in copy, and nothing should feel audited). No gamified guilt (streaks, red budget alarms, "you overspent" verdicts). The warm-lamp identity exists precisely to escape the teal-and-white budgeting-app cliché, and that cliché is a gravity well, not a single mistake: it is where a screen lands when nobody decided otherwise.

**Key Characteristics:**
- Hearth-toned warm palette: lamplit cream ground, cocoa-ink text, a single ember accent.
- Two grounds: app cream (`--bg`) for task surfaces, committed cream (`--bg-committed`) for brand surfaces.
- Flat by default: hairlines and tonal layers convey depth, not shadows.
- Editorial serif (Fraunces) for voice; humanist CJK sans (Noto Sans TC) for the work.
- Generous, friendly radii (10–20px) on a tight, calm, even-px type scale.
- Gentle, reduced-motion-aware motion; nothing bounces.
- A deliberately tiny component vocabulary: the primitives in §5 and no more (the count lives there, so adding one means editing one place).
- Two equals: no UI ever favors or shames one partner.

## 2. Colors

A warm domestic palette lit from one ember source, kept low-chroma so nothing shouts.

### Primary
- **Ember** (#E08856): The single brand accent. The FAB, key CTAs (invite, monthly-review entry), the switch "on" state, and focus rings (at 55% mix). Used sparingly so its warmth reads as a highlight, not a wash.
- **Ember Soft** (#F8D9C2): The accent's quiet tint for soft fills and accent backgrounds where the full ember would be too loud.

### Secondary
- **Cocoa Ink** (#3A2419): The system's anchor. Primary text and, as a fill, the primary commit button and selected chips/segments. The dark-ink fill is the firmest gesture in the room.

### Tertiary
- **Sage** (#7A9F7E): Credit / income / money-coming-in. Also the savings family, with Sage Saving (#5A7A66) for badge text and Saving Soft (#DDE5DC) for its fill.
- **Clay** (#D17561): Debit / money-going-out, and soft error tints (clay at 10%). Clay has two derived companions that exist purely to hold WCAG AA: `--debit-quiet` (clay mixed 72% with cocoa-ink) for the balance-hero "you owe" amount, so the debtor figure reads as calm earth rather than alarm; and `--debit-text` (clay mixed 60% with cocoa-ink, ~4.87:1) for any alert body sitting on the 10% clay tint, because plain clay fails AA there at ~2.7:1.
- **Warning** (#B45309): Amber for paused and warning states, with a 12% tint for the paused pill badge. Distinct from destructive so "paused" never reads as "broken."
- **Destructive** (#B85A48): Deeper red reserved for irreversible actions (leave ledger, delete, sign out), with a 25% tint for its outline variant. Deliberately separate from Clay so "leaving" never reads as "an expense."
- **Realtime Flash** (#FFFBE8): The pale warm yellow that pulses once behind a row when the partner writes from another device. See **The Realtime Flash** in Components.

### Neutral
- **Lamplit Cream** (#FBEDE0): The app ground; the warm room the task surfaces sit in.
- **Committed Cream** (#EFDDC4): The deepened brand-surface ground. Landing, sign-in, migrate, terms, and privacy only. It is the same room with the lamp turned up, not a different palette.
- **Frame Sand** (#E8D5B8): The darker frame visible behind the 448px app shell on wider screens, and the `html`/`body` ground everywhere.
- **Surface White** (#FFFFFF) and **Surface Warm** (#FFF6EC): Card and sheet surfaces; the warm variant adds quiet separation without a border.
- **Cocoa Ink 2** (#7A5848): Secondary text, ghost-button label.
- **Cocoa Ink 3** (#82654F): Tertiary text, captions, metadata, placeholders, secondary-button border, disabled fills. Darkened from an earlier, prettier #B89C8B, which sat at 2.24:1 on cream and failed AA. At #82654F it reaches 4.66:1. This is the floor, not a starting point for lightening back toward the old value.
- **Hairline** (rgba(58,36,25,0.10)): The default separator. This system divides with hairlines, not boxes. The `oik-hairline` utility draws the canonical version, inset by `--sheet-x` on both sides.
- **Grabber** (rgba(58,36,25,0.18)): The sheet drag-handle bar. The only place a neutral is allowed to be more present than a hairline.

### Asset Hue Family (signature)
Per愛物-type identity colors, each muted and emotive, with a tint derived via `color-mix(... 35%, white)` so list rails and charts stay in one hue family per type: House (#CB9B79), Car (#BDB290), Child (#D7A1A6), Pet (#D4AC79), Plant (#9BBA8A), Insurance (#9EB59B), Item (#B7AAA0, the muted generic that sits beneath the emotive types).

### Named Rules

**The One Ember Rule.** Ember (#E08856) is the only accent, and it stays rare: the FAB, a primary CTA, an on-state. If two embers compete on one screen, one of them is wrong. Its scarcity is what makes it feel warm.

**The Pure-Black-and-White Ban.** Never `#000` or `#fff` as a brand surface. Text is Cocoa Ink (#3A2419); grounds are warm cream. Surface White (#FFFFFF) is permitted only for cards and sheets that need to lift off the cream, never as the page ground. The one sanctioned white is `--on-fill`, the shared foreground for text on ink / ember / destructive fills.

**The Quiet-Money Rule.** Sage means in, Clay means out. They never escalate to alarm-red or success-green. Money here is reported, not judged.

**The Two-Grounds Rule.** `--bg` is where the couple works; `--bg-committed` is where the product speaks. Brand surfaces take the committed ground and the serif; app surfaces take the app ground and the sans. Never mix: a landing section on `--bg` looks unfinished, and a dashboard on `--bg-committed` looks like a marketing page wearing app chrome.

**The Derived-Contrast Rule.** When a warm hue must carry text or sit under text, it gets a cocoa-ink-mixed companion rather than an opacity reduction. `--debit-quiet` and `--debit-text` exist for exactly this. Never solve a contrast failure by lightening the background or reaching for a new hue.

## 3. Typography

**Display Font:** Fraunces (with Georgia, serif). Latin only, weights 400 and 500, self-hosted as plain `@font-face` in `app/fonts/fraunces.css` (not `next/font/google`, #978), imported by the root layout. The root `<html>` carries `font-fraunces`, so the family resolves on every route, the dashboard included.
**Body Font:** Noto Sans TC (with a PingFang TC → Microsoft JhengHei → JP → SC → Noto Sans CJK TC fallback chain). Weights 400 and 500, loaded only in the dashboard layout so brand routes stay light.
**Numeric Font:** SF Pro Display / system numerics, with `tnum` for aligned figures.

**Character:** An editorial serif voice over a humanist CJK working face. Fraunces carries the emotional register (headings, the about narrative, the punchline italic at weight 400); Noto Sans TC does the daily work, crisp and neutral. The serif is where the lamp speaks; the sans is where the ledger lists.

### Hierarchy
- **Display** (Fraunces, 500, 19–26px, line-height 1.2, letter-spacing -0.3px): Headings on landing, sign-in, migrate, use-case, legal. The brand's speaking voice.
- **Page** (Noto Sans TC, 500, 26px): Page and sub-page headers inside the app.
- **Title** (Noto Sans TC, 500, 22px, line-height 1.3): Sheet titles, section heroes.
- **Body** (Noto Sans TC, 400, 16px, line-height 1.5): List items, form inputs, prose. Keep CJK measure comfortable; cap Latin prose near 65–75ch.
- **Label** (Noto Sans TC, 500, 14px, letter-spacing 0.6px via `tracking-label`): Section labels, chips, captions. Metadata steps down to 12px.
- **Mini** (10px): Badge superscripts and tiny tracking labels. The only tier below 12px, and the only kept custom tier below Title.
- **Amount** (numeric, 600, 40–56px, `tnum`, `tracking-amount` −1.4px): Hero balances and entry amounts. 600 here is a real face from the system numeric stack, not the fallback the No-Weight-600 Rule below describes. The one place numbers are allowed to be big, because the number is the moment. The two dashboard expense heroes are fluid (`text-amount-fluid`), which is where the 40px floor comes from; the static 44 and 56 tiers cover everything else.

**The full scale (even-px only):** 10 (`text-mini`) · 12 (`text-xs`) · 14 (`text-sm`) · 16 (`text-base`) · 18 (`text-lg`) · 20 (`text-xl`) · 22 (`text-title`) · 26 (`text-page`) · **40** (the `text-amount-fluid` floor — see below) · 44 / 56 (`text-amount-md` / `text-amount-lg`). One class per tier, each mapping to a Tailwind `text-*`; inline `fontSize` is not used. The `--fs-*` custom properties mirror the custom tiers for the rare inline-only context; 18 and 20 are Tailwind natives with no `--fs-*` twin. Every pure-alias tier (`text-micro`/`label`/`body`/`caption`/`meta`/`button`) was removed in favour of the Tailwind-native `text-xs`/`sm`/`base`.

**The fluid tiers, and why there are two families (#1132).** Not all type here is static px. Four `clamp()` tiers scale with the viewport, and they are deliberately split along the register line this section already draws — the names carry the split, and merging them would erase it:

| token | value | register |
|---|---|---|
| `text-amount-fluid` | `clamp(40px, 12vw, 56px)` | **product** — both dashboard expense heroes |
| `text-display-wordmark` | `clamp(56px, 14vw, 84px)` | **brand** — landing, mobile wordmark |
| `text-display-tagline` | `clamp(34px, 9vw, 56px)` | **brand** — landing, mobile tagline |
| `text-display-tagline-lg` | `clamp(56px, 8vw, 96px)` | **brand** — landing, desktop headline |

40 and 34 are real rendered sizes, not typos against the Even-Px Rule: both are even, and both are the *lower bound of a range* rather than a tier anyone sets directly. **Do not "correct" a `clamp()` floor up to the nearest listed tier** — that changes what ships on narrow screens, and nothing in CI will catch it.

The landing page's own letter-spacings (−1.5 / −1 / −3.5px) stay inline on purpose: each appears exactly once, so there is no drift to prevent, and promoting a one-off to a token would describe a scale that does not exist.

**Tracking tokens live in the `--tracking-*` namespace.** `--tracking-label` (0.6px) and `--tracking-amount` (−1.4px). This is load-bearing: `--letter-spacing-*` generates no utility at all, and until #1143 `tracking-label` silently resolved to `letter-spacing: normal` in all 12 places that asked for it. Nothing failed loudly — the class was spelled correctly, the token was defined and commented, no build warning fired. When adding a tracking token, confirm the computed value in a browser rather than trusting that the class exists.

**Two tokens is the whole scale, and the rest of the letter-spacings stay literal on purpose (#1249).** A sweep counted thirteen distinct letter-spacing values live in the app, in two unit systems: px on product surfaces (0.2 / 0.3 / 0.8 / 1 / 1.2 / −0.2 / −1 / −1.5 / −2) and em on the monthly review and quiz (0.18em / 0.12em / 0.1em / 0.08em). **Do not turn that census into a tracking scale.** It would mint a dozen tokens that differ from each other by fractions of a pixel, and the same reasoning the landing page's −1.5 / −1 / −3.5px already rest on (#1132) applies to every one of them: each appears once or twice, there is no drift to prevent, and promoting a one-off to a token describes a scale that does not exist.

What #1249 did instead, and what the next sweep should do: collapse only the sites whose value is **already exactly** `--tracking-label` (0.6px) or `--tracking-amount` (−1.4px) onto the token — sixteen `tracking-[0.6px]` literals became `tracking-label` — and leave every other value inline. The remaining literals are not a backlog.

*The failure this guards against is not a broken screen. It is a tidy-looking PR that adds `--tracking-tight-1`, `--tracking-tight-2`, `--tracking-wide-1` … each with one caller, after which nobody can answer "which one do I use" and the honest answer — "whichever is closest, they all look the same" — is the definition of a scale that is not one.*

### Named Rules

**The Serif-Speaks Rule.** Fraunces is the voice, not the workhorse. On brand surfaces it sets headings and narrative at full voice. Inside the app it is a deliberate exception, used for the moments that ask the couple to stop and look (the monthly review and quiz screens, the partner-left and solo-welcome cards, the leave-ledger and remove-partner flows, the confirm-modal title, the active-trip banner) and for names the couple gave something (the ledger name in `BrandHeader`, asset and trip names). Never set body lists, inputs, labels, buttons, or amounts in the serif. The sans does the work; the serif holds the feeling. *Test: if the serif text is something the user taps, types into, or adds up, it is wrong.*

Availability is never the argument, because the font loads everywhere: `app/layout.tsx` imports `app/fonts/fraunces.css` and puts `font-fraunces` on `<html>`, and the dashboard layout only swaps the *default* family to Noto Sans TC (`font-noto-tc` on its wrapper) without unloading anything. An earlier version of this rule said Fraunces was not loaded inside the dashboard. That was false, and it failed quietly: a design review followed it to a confident, well-cited P1 to strip the serif from intentional emotional moments (#1162). The comment on `.font-fraunces` in `fraunces.css` ("layouts opt subtrees in by class") still describes that older setup, so do not re-derive the claim from it. Two facts do constrain the serif: it ships only Latin subsets, so in zh-TW / zh-CN / ja a serif heading draws its CJK glyphs from the platform fallback and reads as Fraunces only on Latin letters and digits; and the app's L1 titles (Records, Assets, Settings) and month section labels are currently serif while the Page tier above says sans. That disagreement is unresolved; do not "fix" either side without a decision.

**The No-Weight-600 Rule (#1167, #1245).** The self-hosted families ship 400 and 500 only — the 600 faces were dropped to cut render-blocking font CSS, so `app/fonts/noto-sans-tc.css` and `app/fonts/fraunces.css` declare no 600 face, and nothing requests one any more. `font-semibold` on text resolves to the 500 face, and since `body` sets `font-synthesis-weight: none` the browser will not fake one either. Build hierarchy with size and the 400/500 contrast, not heavier weights.

The exception is the **Amount tier**: `--font-numeric` is a system stack (`-apple-system`, `SF Pro Display`, `system-ui`) that really does ship Semibold, so hero balances and entry amounts stay at 600 — a real face, not a fallback. That is the whole exception: 600 is legitimate only on an element that itself carries `font-numeric`, never inherited from an ancestor. `tests/font-weight-loaded.test.ts` enforces both halves, so a 600 on a text element fails CI with the callsite named.

*Earlier wording said 600 "silently falls back to 500". That reading is what made a 600 on CJK text look harmless: before `font-synthesis-weight: none`, some engines synthesized a fake bold instead, which smears CJK strokes, and a selected-vs-unselected pair that differed only by weight looked like it had stopped switching. Neither symptom raises an error or looks wrong in a screenshot.*

**The Even-Px Rule (#876).** Font sizes are even-px only. The 11/13/15px tiers were removed; their callsites merged up into 12/14/16 (`text-xs` / `text-sm` / `text-base`). When a value feels "between" two tiers, round to the nearer even tier. Do not reintroduce an odd size.

**The Existing-Token-First Rule.** Before writing any visual value, reach for the token that already exists: type via `text-*` classes (or `--fs-*` for inline-only contexts), spacing via Tailwind utilities (`px-5`, `py-3`, `gap-2`) and `--sheet-*`, corners via `--radius-*`, color via `--color-*` / `var(--ink*)`, stacking via the `z-*` layer utilities. The scale already covers almost every real need. Two hard constraints follow:

1. **No inline `style` for token-covered values.** Static `fontSize`, `padding`, `margin`, `gap`, `borderRadius`, `z-index`, and color belong in utility classes, never in `style={{ … }}`. Inline `style` is reserved for genuinely dynamic values: computed transforms, data-driven dimensions, palette values resolved at runtime.
2. **Never invent a token or a one-off value on your own.** If the existing scale genuinely cannot express what the design needs, stop and ask the user before adding a new font size, spacing step, radius, z-layer, or token. Prefer even-px when a new size is approved.

## 4. Elevation

This system is **flat by default**. Depth comes from tonal layering (frame sand → cream ground → warm/white surface → hairline divider), not from drop shadows. There are no ambient card shadows; a card lifts by being Surface White on Lamplit Cream with a hairline, not by casting.

What the system does have instead of shadows is an explicit **stacking order**, expressed as named `z-*` utilities so nothing reaches for an arbitrary `z-[999]`:

- `z-relative` (1): local stacking context.
- `z-nav` (80): the bottom nav band. The FAB (`z-[85]`) and home indicator (`z-[81]`) are spatial tweaks inside this band, not separate layers.
- `z-sheet-backdrop` (90) → `z-floating` (95) → `z-sheet` (100): the standard sheet stack, with `z-floating` for cards that must sit over the backdrop.
- `z-modal` (110): modal and toast layer.
- `z-nested-backdrop` (112) → `z-nested-sheet` (115): a sheet opened from inside another sheet.
- `z-top-toast` (120): the ceiling. Nothing goes above it.

Because the app runs inside iOS and Android WebViews, elevation also means respecting what the OS occupies. Any fixed, sticky, or absolutely-positioned element must clear `env(safe-area-inset-*)`: the notch and Dynamic Island at the top, the home indicator and Android gesture bar at the bottom. `--bottom-nav-offset` (112px) reserves scroll clearance so the last feed row is not pinched by the FAB, but it solves only the bottom. A destructive-confirmation screen whose escape control sits under the notch is a trap, and has shipped before.

**Read the inset from `env()`, not from `--safe-top`, anywhere under the dashboard shell.** `--safe-top` is not a general-purpose safe-area source: it exists for the shell's top stack, where `.shell-top-strip ~ *` and `.shell-top-stack:has(> *) ~ *` deliberately zero it so the inset is paid exactly once by whichever band is topmost. Page content inside the shell *is* one of those later siblings, so `var(--safe-top)` reads `0px` there. Using it looks like handling the safe area and provides no allowance at all — no error, no warning, correct-looking markup, and the control still lands under the Dynamic Island. It is only visible by reaching for the control on a notched device. `LeaveGroupFlow` (#1124) carries a comment at its own use of `env(safe-area-inset-top, 0px)` saying this, because the Existing-Token-First Rule otherwise reads as an instruction to "fix" it back.

### Shadow Vocabulary (two small tiers)

**Functional micro-shadows** (tokens in `app/globals.css`):
- **Thumb lift** (`--switch-thumb-shadow`, `0 1px 3px rgba(58,36,25,0.20)`): Only on the moving thumb of a switch, so the moving piece reads as physical.
- **Segment thumb** (`--toggle-segment-thumb-shadow`, `0 1px 3px rgba(31,27,22,0.10)`): The selected segment's quiet lift.
- **Focus ring** (`--toggle-focus-ring`, `0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent)`; `oik-focus-ring`, `.oik-btn`, and `.oik-input-wrapper` draw the same ring from `--focus-ring-color`): Keyboard focus on buttons, inputs, toggles. Soft ember, and pointer clicks stay clean because every rule uses `:focus-visible`, not `:focus`.

**Off-plane elevation** (inline literals, not yet tokens; one value per role, so reuse it rather than adding another):
- **Sheet top edge** (`0 -10px 40px rgba(0,0,0,0.18)`): the `SheetFrame` default, repeated by sheets and floating cards that render their own frame. The income sheets use the same shape in cocoa (`rgba(58,36,25,0.18)`).
- **Modal** (`0 20px 60px rgba(31,27,22,0.18)`): `ConfirmModal` and the insurance renew dialog.
- **Popover / autocomplete**: `MonthSwitcher`, `AssetSwitcher`, and `DescriptionAutocomplete` each carry a different value today. Three values for one role is drift; a new popover picks one of these, not a fourth.
- **Toast** (`shadow-lg`): `PartnerActivityToast`.
- **FAB** (`0 8px 22px rgba(31,27,22,0.28), 0 0 0 5px var(--surface)`): the bottom-nav FAB; the second layer is a surface-colored ring, not extra depth.

Zero-blur `0 0 0 Npx` values (selected swatch rings, the avatar ring, an inset 1px hairline) are borders drawn with `box-shadow`, not elevation. Judge them as borders. Turning the off-plane values into named tokens is worthwhile and still needs sign-off under the Existing-Token-First Rule.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow is allowed in exactly two cases: one of the three functional micro-shadows, or an element that has physically left the page plane (a sheet, modal, popover or autocomplete, toast, fixed floating card, or the FAB), using the value listed above for that role. Anything that scrolls in normal flow with its neighbours (a card, a list row, an in-sheet CTA, an inline button) gets no shadow; separate it with a hairline or a tonal step. An earlier version of this rule said the three micro-shadows were the only box-shadows in the system. Shipped code never matched that (#1157), and a test that flags every sheet gets ignored, which is how decorative shadows slipped in beside the legitimate ones. That is also what the failure looks like: a soft ember or cocoa glow under an in-flow button reads as polish in review, passes every check, and nudges the screen toward the hype-SaaS costume without anyone deciding it should.

**The Named-Layer Rule.** Every stacking decision uses a `z-*` utility from the scale above. An arbitrary `z-[N]` in new code means either the layer already exists under a name, or a new layer needs sign-off. There is no third case.

**The Safe-Area Rule.** Nothing interactive is positioned against a viewport edge without an `env(safe-area-inset-*)` allowance. Verify in the native shell, not the browser: the browser has chrome that hides this failure.

## 5. Components

The vocabulary is deliberately tiny. `components/ui/` holds five primitives: `Button`, `TextInput`, `TextArea`, `SegmentedToggle`, and the compound `Sheet` (`SheetHeader` / `SheetBody` / `SheetFooter`). There is no skeleton, drawer, toast, or empty-state primitive, and that is a constraint, not an oversight. A screen that seems to need a sixth primitive is a screen to re-read, not a license to invent one. `TextArea` was the one addition (#1194, approved 2026-09-15), and it earned the slot by being the same field in a second shape, not a new idea: four hand-rolled `<textarea>`s already existed with no primitive to reach for, and each had drifted.

### Buttons
- **Shape:** Friendly rounded (`--radius-bubble`, 14px). Heights via control tokens: sm 36px, md 44px, lg 52px. Font weight 500, label truncates rather than wraps.
- **Primary:** Cocoa Ink fill (#3A2419) with `--on-fill` text. The firm commit anchor (記下 / 儲存 / 繼續 / 確認).
- **Accent:** Ember fill with `--on-fill` text. The rare ember commit (empty-state "add first record", invite, monthly-review entry). Subject to the One Ember Rule. Flat: no drop shadow; the fill carries it.
- **Secondary:** Surface White with Cocoa Ink text and a Cocoa Ink 3 (#82654F) hairline border. The calm alternative (取消 / 輔助).
- **Ghost:** Transparent with Cocoa Ink 2 (#7A5848) text, no border.
- **Danger:** Destructive fill (#B85A48) with white text (離開帳本 / 刪除). Distinct from Clay debit so "leaving" never reads as "an expense."
- **Disabled:** Cocoa Ink 3 fill at opacity 0.40. Never a grey from outside the palette.
- **States:** `transition-opacity 150ms`. Focus shows the 2px ember ring via `.oik-btn:focus-visible`.

### Chips / Toggles
- **`SegmentedToggle`** (`components/ui/SegmentedToggle.tsx`): the shared primitive for every pill toggle (mode toggle, balance-view, payer/split L3 filters). Presentational and selection-agnostic, so single-select and the dual-select (≥1) member toggles share one surface without sharing one selection rule. `size` `sm` (28px, dense rows) / `md` (32px, mode toggle); per-segment `fillColor` override (member `--ink`/`--accent`, income mint); `.oik-segment` focus ring; `--toggle-*` tokens throughout. Action toggles (`SettleButton`) and the +/− collapse (`ToggleButton`) stay separate by intent.
- **Selected:** Cocoa Ink fill, `--on-fill` text. **Unselected:** Surface White, Cocoa Ink 2 text, hairline border. Compact at 34px tall (`h-chip`), `--radius-chip` (10px).
- **Segmented selector:** A track at `rgba(58,36,25,0.05)` with a Surface White thumb (one of the three functional micro-shadows).
- **Switch (settings):** iOS-style, 44×26px with a 22px thumb. Ember "on", hairline "off", white thumb with the thumb-lift shadow. Track and thumb colors live in `.oik-switch` CSS rather than inline style, so Tailwind preflight's `button { background-color: transparent }` cannot override them; `data-state` swaps the fill without a React re-mount.

### Cards / Containers
- **Corner style:** `--radius-card` (20px) for primary surfaces; `--radius-tile` (18px) for tiles and previews.
- **Background:** Surface White or Surface Warm on the Lamplit Cream ground.
- **Shadow strategy:** None. See Elevation; separation is a hairline and a tonal step.
- **Internal padding:** Sheets use `--sheet-x` 20px, top 16px, bottom 24px. Vary padding for rhythm; do not pad everything identically.
- **Dividers:** `oik-hairline`, a 1px rule inset by `--sheet-x` on both sides. Prefer it to wrapping two pieces of content in separate containers.

### Inputs / Fields
- **Style:** `--input-bg` (Surface White, kept as its own token so inputs can be themed independently), Cocoa Ink text, `--radius-bubble` (14px), 44px tall.
- **Focus:** The `.oik-input-wrapper` shows the 2px ember ring on `:focus-within`. No glow, no border-color flip.
- **Error:** `--debit-text` on a `--debit-soft` tint. Never an alarm red, never an exclamation mark.
- **Keyboard:** Inside the native shells the software keyboard covers content without warning and `100vh` overreports. Forms and sheets must stay usable and scrollable with the keyboard open.
- **`TextInput`** (`components/ui/TextInput.tsx`) is that style as a primitive: `--input-bg`, hairline border, `--radius-bubble`, `--control-md` (44px), 16px Cocoa Ink text, ember ring via `.oik-input-wrapper`. Optional `leftAddon` / `rightAddon` for a unit or counter, `error` for the destructive border. Every native attribute and `ref` lands on the `<input>`, so label association behaves exactly as on a bare field. Don't reach for it when the control is not a text field (`range`, `file`, `checkbox`) or when the input *is* the display — the amount fields (`AmountInput`, `SettlementForm`) are typographic objects that happen to accept typing, and boxing them would turn the record's headline into a form row.
- **`TextArea`** (`components/ui/TextArea.tsx`) is the same field in its multi-line shape, on the same tokens: `--input-bg`, hairline border, `--radius-bubble`, minimum `--control-md`, 16px text, the same `:focus-within` ring, and `resize-y` so a long note can be opened up. Height comes from `rows`. It carries no label of its own — pass `id` with an external `<label htmlFor>`. Don't use it inside a container that already has its own border (a bordered card), where a second box reads as a nested frame rather than a field; there, a borderless textarea on the card ground is correct.

### Navigation
- **Bottom nav + FAB** (mobile shell): a fixed band at `z-nav` (80–89), 78px tall. The FAB is the one ember element, the round invitation to record. Scroll containers reserve `--bottom-nav-offset` (112px) so the last row never hides behind the FAB. Both must clear the bottom safe-area inset.
- **Document behavior is suppressed on purpose.** `overscroll-behavior: none` blocks Android Chrome pull-to-refresh and edge bounce; `-webkit-tap-highlight-color: transparent` kills the grey tap flash; scrollbars are hidden. The shell is a fixed app surface, not a scrolling document. Do not reintroduce these behaviors, and do not go the other way by simulating native choreography (spring page pushes, interactive swipe-back) to disguise the WebView.

### Signature: The Amount Hero
Large `tnum` numerics (44–56px) for the dashboard balance and entry amount. This is the deliberate exception to the system's restraint: the number gets to be big because, in this moment, the number is the point. Pair it with quiet labels, never with a supporting grid of stats (that is the hero-metric cliché this system bans). When the figure is a debt owed, it uses `--debit-quiet`, not full Clay.

### Signature: The Realtime Flash
The second signature, and the only place the system animates something the user did not do. When the partner writes from another device, the arriving row pulses once from Realtime Flash (#FFFBE8) to transparent over 1s ease-out (`.rt-flash`); a removed row collapses via `.rt-fading` (opacity and max-height, 0.5s ease-out); and a `partner-toast` fades and slides 8px in, holds, and fades out across a 3s lifetime with `cubic-bezier` ease-out.

This is 陪伴 made literal: the other person is not here, but they just moved. It earns signature status for the same reason the ember does, by being rare. Rules:

- **One flash per arrival.** Never loop, never repeat, never stack flashes when several rows arrive together.
- **Warm, not alert.** The flash color is a pale warm yellow that reads as a lamp flickering, not a notification badge. It never becomes ember, sage, or clay.
- **Under one second, then gone.** It must be finished before the user can react to it. If a user has time to look at the flash, it is too slow.
- **Never for the user's own writes.** The user already knows what they did; flashing it back is a machine congratulating them.
- **Never a count.** No "3 new records" badge, no unread state, no tally. It is a presence signal, not an inbox.

### The Brand Mark

The mark is a lantern (提燈), drawn once in `components/FutariMark.tsx`. Everything renders from there: `public/favicon.svg`, `app/favicon.ico`, the two `scripts/og/*.html` templates, and every `<FutariMark>` callsite. The two `FutariMark.tsx` files that used to hold their own copies (`app/[locale]/_landing/`, `app/(dashboard)/_components/`) are now re-exports; the landing one still owns the six inline feature glyphs, which are unrelated.

**Why a lantern.** The store and app icons have been the lantern since 2026-06-08 (`b9b3da0`), but the web mark stayed on the earlier flat two-tone heart, so the same product showed two unrelated logos depending on where you met it — App Store versus browser tab. Unified 2026-09-16.

**Why an outline, not a solid.** One component renders from 16px (favicon) to 420px (the migrate / use-case page mark) — a 26× range. A solid silhouette holds up better at 16px but reads heavy at 420px, nothing like the soft illustrated master the store icon comes from. The outline keeps the large end light. The cost is real: at 16px it is softer than a solid would be, and `app/favicon.ico` compensates by rendering its 16px entry at stroke 2.6 instead of 2.2 — the same drawing at a heavier optical weight, which is what per-size ICO entries exist for.

**What is *not* the mark.** `public/illustration-hero.png` is a scene, not a logo: two people on a sofa under a warm floor lamp. Its lamp is a different object from the mark's lantern and that is fine — it is a deliberate brand-register choice ([brand-register-design.md](docs/superpowers/specs/brand-register-design.md)), not drift. Do not "unify" it into a lantern without revisiting that spec.

**Failure mode.** Nothing errors if someone re-introduces a local copy of the path — the drawing is eleven numbers and a path string, easy to paste. It just drifts silently, which is exactly what happened to the two components before this. The control is that there is one file to change; there is no test that can tell a deliberate redraw from an accidental one.

## 6. Do's and Don'ts

Each Don't carries a one-sentence audit test. Run the test on the screen; if it fails, the Don't applies.

### Do:
- **Do** keep Ember (#E08856) rare: one accent moment per screen (the One Ember Rule).
- **Do** separate surfaces with hairlines (rgba(58,36,25,0.10)) and tonal steps (sand → cream → warm → white), not shadows. Reach for `oik-hairline` before reaching for a container.
- **Do** set brand-surface headings in Fraunces 500 on `--bg-committed`; set the working ledger in Noto Sans TC on `--bg`.
- **Do** use the dark Cocoa Ink fill for the primary commit, so the one firm action is unmistakable.
- **Do** give amounts room to be big with `tnum`, paired with a quiet label.
- **Do** give every new animation a `prefers-reduced-motion: reduce` branch, matching `.partner-toast` and `.about-article`. Three existing animations (`.rt-flash`, `.rt-fading`, `.animate-blink`) still lack one; adding motion without a branch widens a known gap.
- **Do** keep transitions near 150ms and ease-out (the about fade-up uses `cubic-bezier(0.22, 1, 0.36, 1)`).
- **Do** pair the Sage/Clay credit-debit distinction with a non-color cue (sign, label, icon) for color-blind legibility.
- **Do** solve a warm-hue contrast failure with a cocoa-ink-mixed companion (`--debit-text`, `--debit-quiet`), never by lightening the ground.
- **Do** treat both partners as equals, and treat solo mode as a complete state rather than a half-finished setup.
- **Do** clear `env(safe-area-inset-*)` on every fixed or sticky element, and verify it in the native shell rather than the browser.
- **Do** reach for an existing token first: `text-*` for type, Tailwind spacing utilities plus `--sheet-*` for padding, `--radius-*` for corners, `--color-*` / `var(--ink*)` for color, `z-*` for stacking.
- **Do** keep every font size even-px, mapped to a `text-*` class (The Even-Px Rule).

### Don't:
- **Don't** use `#000` or `#fff` as a brand surface; text is Cocoa Ink, grounds are warm cream. *Test: search the diff for `#fff`, `#ffffff`, `white`, and `black`; every hit that is not `--on-fill` on a filled control is wrong.*
- **Don't** ship cold fintech (navy-and-gold, dense data grids, "wealth management" gravitas). *Test: if the screen would look at home with a stock-ticker strip added to it, it is too institutional.*
- **Don't** ship hype-SaaS costume: purple gradients, decorative glassmorphism, gradient text, or the big-number hero-metric dashboard template. *Test: if there is more than one big number on the screen, none of them is the moment.*
- **Don't** let the screen drift back to the generic budgeting app. *Test: screenshot it and desaturate to greyscale; if you can still count discrete rectangular blocks, there are too many containers, and the hairline should be doing that work.*
- **Don't** use exclamation marks in UI copy, or the words 管理 / 追蹤 / 監控. *Test: grep the diff's i18n keys for `！`, `!`, `管理`, `追蹤`, `監控`; any hit in user-facing copy is wrong.*
- **Don't** tell the user how to feel about their own records. *Test: read the string aloud; if it contains an adjective about the user or their month rather than a fact about what happened, cut the adjective.*
- **Don't** add gamified guilt: streaks, budget-exceeded red alarms, "you overspent" verdicts, or anxiety to drive engagement. *Test: if a number turns red or a state escalates because a threshold was crossed, it is a verdict.*
- **Don't** use a `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, list items, or alerts; use a full hairline, a tonal tint, or a leading icon instead. *Test: grep for `border-l-` and `border-r-` above 1px.*
- **Don't** reach for a drop shadow to separate surfaces; the system is flat by default. *Test: for each `box-shadow` / `boxShadow` / `shadow-*` in the diff that is not a functional micro-shadow, check whether the element is fixed, floating, or layered over other content; if it scrolls in normal flow with its neighbours, the shadow is decorative. Zero-blur `0 0 0 Npx` rings are borders, not shadows.*
- **Don't** default to a modal; exhaust inline and sheet-based progressive alternatives first. *Test: if the content could live in a `Sheet` or expand in place, the modal is laziness.*
- **Don't** write an arbitrary `z-[N]`. *Test: grep for `z-[` in the diff; every hit outside the nav band's `z-[81]` / `z-[85]` needs either an existing named layer or sign-off.*
- **Don't** put token-covered values in inline `style={{ … }}`; static `fontSize` / `padding` / `margin` / `borderRadius` / `z-index` / color go in utility classes. *Test: grep the diff for `style={{`; every surviving hit must be a genuinely computed value.*
- **Don't** invent a new font size, spacing step, radius, z-layer, token, or `components/ui/` primitive on your own. *Test: if the change adds a line to `:root` or a file to `components/ui/`, stop and ask first.* (The rule stands as written. `TextArea` was added through it, not around it: asked in #1194, approved 2026-09-15.)
- **Don't** ask for weight 600 on text; no 600 face is loaded and bold synthesis is off, so `font-semibold` renders identically to `font-medium`. Amounts are the one exception, and only on an element that carries `font-numeric` itself. *Test: run `tests/font-weight-loaded.test.ts`; it names any 600 that isn't on a `font-numeric` element.*
- **Don't** add a partial dark palette, ad-hoc `dark:` variants, or a theme toggle. *Test: grep for `dark:` and `prefers-color-scheme`; Futari is light-only until the night-lamp direction is scoped and approved.*
- **Don't** position anything interactive against a viewport edge without a safe-area allowance. *Test: open the screen in the iOS shell on a notched device and try to reach every control, especially the escape route on a destructive-confirmation screen.*
- **Don't** simulate native choreography (spring page pushes, interactive swipe-back, rubber-band overscroll) to disguise the WebView. *Test: if an animation exists to make the web feel native rather than to convey state, cut it.*
- **Don't** fall into the teal-and-white budgeting-app aesthetic; the warm lamp exists to escape it. *Test: if the palette would survive being swapped for teal-and-white without the screen looking wrong, the warmth is not doing any work.*
