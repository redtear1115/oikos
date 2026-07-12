---
last_updated: 2026-07-13
---

# Brand-Surface Committed Register (#832)

---
status: ready-to-implement
first_shipped_in: ~v1.5.0
related_issues: ["#832"]
related_specs: []
blocked_on: []
---

## What

Upgrade the **brand-surface tier** (landing, sign-in, migrate/*, terms, privacy) from the current *Restrained* color outfit to a *Committed* one — a deepened morning-cream ground (`--bg-committed: #EFDDC4`) — and introduce an illustration slot in the landing hero that replaces the current PhonePreview-as-sole-visual approach.

This is a **visual register change only**. No behavioral, routing, or data changes.

## Why

The current landing shares the same `--bg` (`#FBEDE0`) as the in-app ledger. Brand surfaces should feel emotionally distinct — warmer, more personal — to do the job of earning trust before the user enters the product. A Committed ground (one clearly owned warm hue covering 30–60% of the surface) achieves this without touching the One Ember Rule inside the app.

The illustration adds human warmth that a phone screenshot alone cannot communicate. The chosen image (two people from behind on a sofa, warm lamp, floating light orbs) directly embodies Futari's "陪伴式記錄" philosophy.

## Scope

### In scope
- New CSS token `--bg-committed`
- Landing hero: add illustration slot, demote PhonePreview, adjust copy column width
- Landing mobile: illustration band leads above wordmark
- Sign-in, migrate/*, terms, privacy: swap `--bg` → `--bg-committed` on their page backgrounds
- `.impeccable/design.json`: add Brand-Surface Exemption rule
- Save illustration asset to `public/`

### Out of scope
- In-app surfaces (dashboard, sheets, settings, onboarding) — unchanged
- Copy changes — unchanged
- Routing, analytics, i18n strings — unchanged
- Future commissioned illustration swap (the slot is ready; replacing the image later is a one-file change)

## Design Tokens

Add to `app/globals.css` inside `:root`:

```css
/* Committed brand-surface ground — morning-gentle deepened cream.
   Brand-surface tier only (landing, sign-in, migrate, terms, privacy).
   App shell + task surfaces keep --bg. */
--bg-committed: #EFDDC4;
```

Existing tokens reused unchanged: `--ink`, `--ink-2`, `--ink-3`, `--accent`, `--surface`, `--surface-alt`, `--hairline`.

## Brand-Surface Exemption Rule

Add to `.impeccable/design.json` under `narrative.rules`:

```json
{
  "name": "The Brand-Surface Exemption",
  "section": "colors",
  "body": "The One Ember Rule governs PRODUCT surfaces (the ledger, settings, task flows). The BRAND-surface tier — landing, sign-in, migrate, terms, privacy — is exempt and may adopt a Committed color strategy: one warm hue (a deepened cream ground, --bg-committed #EFDDC4) covering 30–60% of the surface as the page's base tone. Ember (#E08856) stays rare even here: at most one moment per screen, as a primary CTA or a single point of warm light, never a large fill. Committed always commits the GROUND, never the accent."
}
```

## Illustration Asset

**File:** `public/illustration-hero.png` (landscape, ~16:9 for mobile band; the same image is used for both layouts, cropped via CSS object-fit/object-position)

**Chosen image:** Two people seated on a sofa from behind, heads close together looking at a phone. A warm floor lamp behind them. Floating light orbs and flowing light trails in ember/sage/cream tones. Cozy evening interior, city window in background. Illustrated style, warm palette.

**Mobile crop:** full-width band, `h-[252px]`, `object-cover object-top`, `rounded-3xl`

**Desktop crop:** right column, fills `flex-1` height, `object-cover object-center`, `rounded-3xl`

The illustration slot is isolated in a single `<IllustrationSlot>` component so swapping the image later requires no JSX changes.

## Landing Hero — Desktop (`app/[locale]/_landing/Landing.tsx`)

**Layout change:** two-column hero, copy column shrinks from `w-[600px]` to `w-[520px]` to give the illustration column more room.

**Right column (currently `<PhonePreview>` only):**

Replace with:
```
<div relative flex-1>
  <IllustrationSlot />                  {/* fills column */}
  <PhonePreview scale={0.78} />         {/* absolute, bottom-right corner, overlapping illo */}
</div>
```

`PhonePreview` gets a `scale` prop (default `1`); at `0.78` it becomes a secondary product-proof tucked at the bottom-right of the illustration.

**No copy changes.** Kicker, h1, body, CTA row are unchanged.

## Landing Hero — Mobile

**Layout change:** illustration band leads before the wordmark.

Current order:
1. `<FutariMark size={88} />`
2. "Futari" wordmark
3. kana
4. tagline h1
5. body
6. CTA

New order:
1. `<IllustrationSlot mobile />` — full-width, 252px tall, `rounded-3xl`, `mx-4`
2. "Futari" wordmark (keep)
3. tagline h1 (keep)
4. body (keep)
5. CTA (keep)

The large `<FutariMark size={88} />` above the wordmark is **removed** on mobile — the illustration takes that role as the emotional opener. The kana line (`ふたり`) is also removed from mobile (currently shown between wordmark and tagline).

## Other Brand-Surface Pages

Each page has `style={{ background: 'var(--bg)' }}` on its outermost element. Change to `var(--bg-committed)`.

| File | Element |
|---|---|
| `app/[locale]/sign-in/page.tsx` | `<main>` background |
| `app/[locale]/migrate/layout.tsx` | layout wrapper background |
| `app/[locale]/terms/page.tsx` | `<main>` background |
| `app/[locale]/privacy/page.tsx` | `<main>` background |

No other changes to these files.

## IllustrationSlot Component

New file: `app/[locale]/_landing/IllustrationSlot.tsx`

Props:
- `mobile?: boolean` — if true, applies mobile dimensions/crop; default false (desktop)

Renders a `<div>` containing a `<Image>` (Next.js) pointing to `/illustration-hero.png`.

- Desktop: `w-full h-full object-cover object-center rounded-3xl`
- Mobile: `w-full h-[252px] object-cover object-top rounded-3xl`

No animation, no hover states. `alt=""` (decorative; the copy carries the meaning).

## PhonePreview Scale Prop

`app/[locale]/_landing/PhonePreview.tsx` currently renders at a fixed size. Add a `scale?: number` prop (default `1`) that multiplies width/transform to allow the `0.78` demoted variant on desktop without internal layout changes.

The demoted phone is `position: absolute; right: -8px; bottom: 24px` inside the right column wrapper — overlapping the illustration's bottom-right corner.

## Interactions & Motion

No behavioral change. No new animations. `prefers-reduced-motion` is unaffected.

## Files to Edit

1. `app/globals.css` — add `--bg-committed`
2. `app/[locale]/_landing/Landing.tsx` — committed ground + hero layout + illo slot + mobile reorder
3. `app/[locale]/_landing/IllustrationSlot.tsx` — **new file**
4. `app/[locale]/_landing/PhonePreview.tsx` — add `scale` prop
5. `app/[locale]/sign-in/page.tsx` — `--bg` → `--bg-committed`
6. `app/[locale]/migrate/layout.tsx` — `--bg` → `--bg-committed`
7. `app/[locale]/terms/page.tsx` — `--bg` → `--bg-committed`
8. `app/[locale]/privacy/page.tsx` — `--bg` → `--bg-committed`
9. `.impeccable/design.json` — add Brand-Surface Exemption rule
10. `public/illustration-hero.png` — add illustration asset
