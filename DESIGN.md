---
name: Futari
description: A warm, two-person household ledger that feels like a lamp left on, not a spreadsheet.
colors:
  lamplit-cream: "#FBEDE0"
  frame-sand: "#E8D5B8"
  surface-white: "#FFFFFF"
  surface-warm: "#FFF6EC"
  cocoa-ink: "#3A2419"
  cocoa-ink-2: "#7A5848"
  cocoa-ink-3: "#B89C8B"
  ember: "#E08856"
  ember-soft: "#F8D9C2"
  sage: "#7A9F7E"
  clay: "#D17561"
  destructive: "#B85A48"
  warning: "#B45309"
  sage-saving: "#5A7A66"
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
  title:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
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
components:
  button-primary:
    backgroundColor: "{colors.cocoa-ink}"
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
---

# Design System: Futari

## 1. Overview

**Creative North Star: "The Warm Lamp"**

Futari is a ledger that behaves like a lamp left on for two people. The light is present and warm; it witnesses the day without glaring at it. Everything in this system serves that feeling: a daily accounting chore reframed as companionship (陪伴式記錄框架), where each record is a small point of warm light and the running story matters more than any single number. The palette is hearth-toned, the surfaces sit flat and quiet, and the type carries an editorial calm rather than dashboard urgency.

The register is **product**: design serves the task. But the task is emotional, so restraint is the discipline, not coldness. Controls are confident and unhurried (refined and restrained), surfaces lean on hairlines and tonal warmth instead of drop shadows, and motion is a soft exhale, never a performance. The signature gesture is the dark-ink fill: the primary commit button (記下 / 儲存 / 確認) is the firm anchor in a soft, cream-lit room.

This system explicitly rejects the things a money app reflexively becomes. No cold fintech gravitas (navy-and-gold, dense grids, "wealth management" weight). No hype-SaaS costume (purple gradients, decorative glass, big-number hero metrics, exclamation marks). No surveillance framing (the words 管理 / 追蹤 / 監控 are banned in copy, and nothing should feel audited). No gamified guilt (streaks, red budget alarms, "you overspent" verdicts). The warm-lamp identity exists precisely to escape the teal-and-white budgeting-app cliché.

**Key Characteristics:**
- Hearth-toned warm palette: lamplit cream ground, cocoa-ink text, a single ember accent.
- Flat by default: hairlines and tonal layers convey depth, not shadows.
- Editorial serif (Fraunces) for voice; humanist CJK sans (Noto Sans TC) for the work.
- Generous, friendly radii (14–20px) on a tight, calm type scale.
- Gentle, reduced-motion-aware motion; nothing bounces.
- Two equals: no UI ever favors or shames one partner.

## 2. Colors

A warm domestic palette lit from one ember source, kept low-chroma so nothing shouts.

### Primary
- **Ember** (#E08856): The single brand accent. The FAB, key CTAs (invite, monthly-review entry), the switch "on" state, and focus rings (at 55% mix). Used sparingly so its warmth reads as a highlight, not a wash.
- **Ember Soft** (#F8D9C2): The accent's quiet tint for soft fills and accent backgrounds where the full ember would be too loud.

### Secondary
- **Cocoa Ink** (#3A2419): The system's anchor. Primary text and, as a fill, the primary commit button and selected chips/segments. The dark-ink fill is the firmest gesture in the room.

### Tertiary
- **Sage** (#7A9F7E): Credit / income / money-coming-in. Also the savings family (#5A7A66 deep, #DDE5DC soft).
- **Clay** (#D17561): Debit / money-going-out, and soft error tints (#D17561 at 10%). The balance-hero "you owe" amount uses a muted clay (`--debit-quiet`, clay mixed toward cocoa-ink) so the debtor figure reads as calm earth, not alarm (witnessing tone).

### Neutral
- **Lamplit Cream** (#FBEDE0): The app ground; the warm room the content sits in.
- **Frame Sand** (#E8D5B8): The darker frame visible behind the 448px app shell on wider screens.
- **Surface White** (#FFFFFF) and **Surface Warm** (#FFF6EC): Card and sheet surfaces; the warm variant adds quiet separation without a border.
- **Cocoa Ink 2** (#7A5848): Secondary text, ghost-button label.
- **Cocoa Ink 3** (#B89C8B): Tertiary text, placeholders, secondary-button border, disabled fills.
- **Hairline** (rgba(58,36,25,0.10)): The default separator. This system divides with hairlines, not boxes.

### Asset Hue Family (signature)
Per愛物-type identity colors, each muted and emotive, with a tint derived via `color-mix(... 35%, white)` so list rails and future charts stay in one hue family per type: House (#CB9B79), Car (#BDB290), Child (#D7A1A6), Pet (#D4AC79), Plant (#9BBA8A), Insurance (#9EB59B), Item (#B7AAA0, the muted generic that sits beneath the emotive types).

### Named Rules
**The One Ember Rule.** Ember (#E08856) is the only accent, and it stays rare: the FAB, a primary CTA, an on-state. If two embers compete on one screen, one of them is wrong. Its scarcity is what makes it feel warm.

**The Pure-Black-and-White Ban.** Never `#000` or `#fff` as a brand surface. Text is Cocoa Ink (#3A2419); grounds are warm cream. Surface White (#FFFFFF) is permitted only for cards and sheets that need to lift off the cream, never as the page ground.

**The Quiet-Money Rule.** Sage means in, Clay means out. They never escalate to alarm-red or success-green. Money here is reported, not judged.

## 3. Typography

**Display Font:** Fraunces (with Georgia, serif). Latin only, weights 400 and 500.
**Body Font:** Noto Sans TC (with PingFang TC, Microsoft JhengHei, and a JP/SC system fallback chain).
**Numeric Font:** SF Pro Display / system numerics, with `tnum` for aligned figures.

**Character:** An editorial serif voice over a humanist CJK working face. Fraunces carries the emotional register (headings, the about narrative, the punchline italic at weight 400); Noto Sans TC does the daily work, crisp and neutral. The serif is where the lamp speaks; the sans is where the ledger lists.

### Hierarchy
- **Display** (Fraunces, 500, 19–26px, line-height 1.2, letter-spacing -0.3px): Headings on landing, sign-in, migrate, legal. The brand's speaking voice.
- **Title** (Noto Sans TC, 500, 22px, line-height 1.3): Sheet titles, section heroes.
- **Page** (Noto Sans TC, 500, 26px): Page and sub-page headers in the app.
- **Body** (Noto Sans TC, 400, 15px, line-height 1.5): List items, form inputs, prose. Keep CJK measure comfortable; cap Latin prose near 65–75ch.
- **Label** (Noto Sans TC, 500, 13px): Section labels, chips, captions. Metadata steps down to 11–12px.
- **Amount** (numeric, 500, 44–56px, `tnum`): Hero balances and entry amounts. The one place numbers are allowed to be big, because the number is the moment.

### Named Rules
**The Serif-Speaks Rule.** Fraunces is reserved for the brand's voice (headings and narrative). Never set body lists, inputs, or amounts in the serif. The sans does the work; the serif holds the feeling.

**The No-Weight-600 Rule.** Weight 600 was dropped to cut render-blocking CSS; `font-semibold` falls back to 500. Build hierarchy with size and the 400/500 contrast, not heavier weights.

## 4. Elevation

This system is **flat by default**. Depth comes from tonal layering (cream ground → warm/white surface → hairline divider), not from drop shadows. There are no ambient card shadows; a card lifts by being Surface White on Lamplit Cream with a hairline, not by casting.

### Shadow Vocabulary (deliberately tiny)
- **Thumb lift** (`box-shadow: 0 1px 3px rgba(58,36,25,0.20)`): Only on the moving thumb of a switch or segmented toggle, so the moving piece reads as physical.
- **Segment thumb** (`box-shadow: 0 1px 3px rgba(31,27,22,0.10)`): The selected segment's quiet lift.
- **Focus ring** (`box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent)`): Keyboard focus on buttons, inputs, toggles. Soft ember, pointer clicks stay clean.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. The only box-shadows in the system are the toggle thumb lift and the focus ring; both are functional, never decorative. If you reach for a shadow to separate two surfaces, use a hairline or a tonal step instead.

## 5. Components

### Buttons
- **Shape:** Friendly rounded (`--radius-bubble`, 14px). Heights via control tokens: sm 36px, md 44px, lg 52px. Font weight 500, label truncates rather than wraps.
- **Primary:** Cocoa Ink fill (#3A2419) with Surface White text. The firm commit anchor (記下 / 儲存 / 繼續 / 確認).
- **Secondary:** Surface White with Cocoa Ink text and a Cocoa Ink 3 (#B89C8B) hairline border. The calm alternative (取消 / 輔助).
- **Ghost:** Transparent with Cocoa Ink 2 (#7A5848) text, no border.
- **Danger:** Destructive fill (#B85A48) with white text (離開帳本 / 刪除). Distinct from Clay debit so "leaving" never reads as "an expense."
- **Accent:** Ember fill (`--btn-accent-bg`) with white text. The rare ember commit (empty-state "add first record", invite, monthly-review entry). Subject to the One Ember Rule. Flat: no drop-shadow; the fill carries it.
- **States:** `transition-opacity 150ms`; disabled drops to opacity 0.40. Focus shows the 2px ember ring.

### Chips / Toggles
- **`SegmentedToggle`** (`components/ui/SegmentedToggle.tsx`): the shared primitive for every pill toggle (mode toggle, balance-view, payer/split L3 filters). Presentational and selection-agnostic, so single-select and the dual-select (≥1) member toggles share one surface without sharing one selection rule. `size` `sm` (28px, dense rows) / `md` (32px, mode toggle); per-segment `fillColor` override (member `--ink`/`--accent`, income mint); `.oik-segment` focus ring; `--toggle-*` tokens throughout. Action toggles (`SettleButton`) and the +/− collapse (`ToggleButton`) stay separate by intent.
- **Selected:** Cocoa Ink fill, white text. **Unselected:** Surface White, Cocoa Ink 2 text, hairline border. Compact at 34px tall, `--radius-chip` (10px).
- **Segmented selector:** A track at `rgba(58,36,25,0.05)` with a Surface White thumb (the only place a tiny shadow lifts the selected segment).
- **Switch (settings):** iOS-style; Ember "on", hairline "off", white thumb with the thumb-lift shadow.

### Cards / Containers
- **Corner style:** `--radius-card` (20px) for primary surfaces; `--radius-tile` (18px) for tiles/previews.
- **Background:** Surface White or Surface Warm on the Lamplit Cream ground.
- **Shadow strategy:** None. See Elevation; separation is a hairline and a tonal step.
- **Internal padding:** Sheets use `--sheet-x` 20px, top 16px, bottom 24px. Vary padding for rhythm; do not pad everything identically.

### Inputs / Fields
- **Style:** Surface White, Cocoa Ink text, `--radius-bubble` (14px), 44px tall.
- **Focus:** The wrapper shows the 2px ember focus ring on `:focus-within`. No glow, no border-color flip.
- **Error:** Clay (#D17561) text on a 10% Clay tint. Never an alarm red, never an exclamation mark.

### Navigation
- **Bottom nav + FAB** (mobile shell): a fixed band (z 80–89). The FAB is the one ember element, the round invitation to record. Scroll containers reserve `--bottom-nav-offset` (112px) so the last row never hides behind the FAB.

### Signature: The Amount Hero
Large `tnum` numerics (44–56px) for the dashboard balance and entry amount. This is the deliberate exception to the system's restraint: the number gets to be big because, in this moment, the number is the point. Pair it with quiet labels, never with a supporting grid of stats (that is the hero-metric cliché this system bans).

## 6. Do's and Don'ts

### Do:
- **Do** keep Ember (#E08856) rare: one accent moment per screen (the One Ember Rule).
- **Do** separate surfaces with hairlines (rgba(58,36,25,0.10)) and tonal steps (cream → warm → white), not shadows.
- **Do** set headings and brand voice in Fraunces 500; set the working ledger in Noto Sans TC.
- **Do** use the dark Cocoa Ink fill for the primary commit, so the one firm action is unmistakable.
- **Do** give amounts room to be big with `tnum`, paired with a quiet label.
- **Do** respect `prefers-reduced-motion`; keep transitions near 150ms and ease-out (the about-fade-up uses cubic-bezier(0.22, 1, 0.36, 1)).
- **Do** pair the Sage/Clay credit-debit distinction with a non-color cue (sign, label, icon) for color-blind legibility.
- **Do** treat both partners as equals; never style solo mode as a deficient state.

### Don't:
- **Don't** use `#000` or `#fff` as a brand surface; text is Cocoa Ink, grounds are warm cream.
- **Don't** ship cold fintech (navy-and-gold, dense data grids, "wealth management" gravitas).
- **Don't** ship hype-SaaS costume: purple gradients, decorative glassmorphism, gradient text, or the big-number hero-metric dashboard template.
- **Don't** use exclamation marks in UI copy, or the words 管理 / 追蹤 / 監控.
- **Don't** add gamified guilt: streaks, budget-exceeded red alarms, "you overspent" verdicts, or anxiety to drive engagement.
- **Don't** use a `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, list items, or alerts; use a full hairline, a tonal tint, or a leading icon instead.
- **Don't** reach for a drop shadow to separate surfaces; the system is flat by default.
- **Don't** default to a modal; exhaust inline and sheet-based progressive alternatives first.
- **Don't** fall into the teal-and-white budgeting-app aesthetic; the warm lamp exists to escape it.
