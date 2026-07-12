---
last_updated: 2026-07-13
status: shipped
first_shipped_in: v1.1.2
related_issues: ["#629"]
---

# Design System Primitives

## What
A token layer and three primitive components (Button, TextInput, Sheet inner wrappers)
that standardise spacing, radius, height, and focus treatment across the app.

Components:
- `components/ui/Button.tsx` — 4 variants (primary/secondary/ghost/danger) × 3 sizes (sm/md/lg)
- `components/ui/TextInput.tsx` — wrapper with leftAddon/rightAddon slots and error state
- `components/ui/Sheet/SheetHeader.tsx` — title row with leading + trailing slots and optional `centered` 3-column variant
- `components/ui/Sheet/SheetBody.tsx` — scrollable content area
- `components/ui/Sheet/SheetFooter.tsx` — sticky footer with iOS safe-area handling

Token additions (in `app/globals.css`):
- Control heights: `--control-sm/md/lg` (36/44/52px)
- Sheet spacing: `--sheet-x/y-top/y-bottom` (20/16/24px)
- `--input-bg`, `--focus-ring-color`, `@utility oik-focus-ring`, `.oik-btn`, `.oik-input-wrapper`

## Why
Audit of the codebase (issue #629) found:
- 11 distinct border-radius values on buttons
- 3 input padding patterns with hard-coded `bg-white`
- 27 files using `disabled:opacity-50` without a shared standard
- Sheet padding inconsistent: `px-4`/`px-5`/`px-6` and `pb-6`/`pb-8`/`pb-12` mixed

Without shared primitives, each new feature adds another ad-hoc variant. The token-first
approach means the token layer lands first, primitives consume tokens, and existing callsites
migrate incrementally via the `refactor/design-system` issue backlog.

## Who
- Any engineer building new features **must** use Button / TextInput / Sheet primitives.
- Existing callsites migrate via the `refactor/design-system` issue backlog —
  one surface per issue, 1-2 files per PR, labelled `refactor/design-system`.
- The pilot migration was `InstallGuide.tsx` — proof-of-concept for the API.
- `Switch.tsx` is not in scope for this round; evaluate in a future pass.
