# Futari OG image renderer

Renders 3 OG / social-share images for the Futari landing from a single
`template.html` source (Editorial direction — 「兩個人，**一本帳**。」).

## What gets generated

| File | Size | Where it goes | Use |
|---|---|---|---|
| `og-image.png` | 1200 × 630 | `public/og-image.png` | Default OG (referenced in `app/layout.tsx`) |
| `og-line.png` | 1200 × 600 | `public/og-line.png` | LINE Talk share image (slightly shorter aspect) |
| `og-square.png` | 1200 × 1200 | `public/og-square.png` | Instagram / Threads square preview |

Outputs write to `../../public/` (i.e. `oikos/public/`).

## How to run

```bash
cd scripts/og
npm install        # one-time — downloads Chromium via Puppeteer (~170 MB)
node render.mjs
```

Outputs:

```
✓ og-image.png    → /path/to/oikos/public/og-image.png      (1200×630 px)
✓ og-line.png     → /path/to/oikos/public/og-line.png       (1200×600 px)
✓ og-square.png   → /path/to/oikos/public/og-square.png     (1200×1200 px)
```

## How it works

- `template.html` is a single self-contained renderer driven by URL query
  params (`?w=1200&h=630&s=1&layout=wide`). It loads Fraunces + Noto Sans TC
  from Google Fonts and sets `window.__OG_READY__ = true` after
  `document.fonts.ready` resolves.
- `render.mjs` opens each target in a fresh Puppeteer page, sets the
  viewport to the exact target size (with `deviceScaleFactor` for retina),
  waits for `__OG_READY__`, then screenshots a `clip` rect of exactly W×H
  CSS pixels. The PNG comes out at `W * dsr` × `H * dsr` actual pixels.

## Adjusting the design

Edit `template.html`. The wide layout uses `--s` (scale) so every dimension
scales proportionally — if you want bigger text on retina you can pass a
different `s` value, but the default `s=1` + `deviceScaleFactor=2` already
gives clean 2× output.

## Preview without rendering

Open `template.html?w=1200&h=630&s=1&layout=wide` directly in a browser to
preview the design without running the script.
