#!/usr/bin/env node
/**
 * Mirror the Google Fonts woff2 files into `public/fonts/` and emit the matching
 * `@font-face` CSS with same-origin URLs.
 *
 * Why this exists: `next/font/google` downloads every font file listed in the
 * Google CSS at *build* time, and a single failed fetch aborts the whole build
 * (`next/font` retries 3x internally, then throws — only `next dev` falls back).
 * Noto Sans TC is served as 105 unicode-range chunks, so every deploy was making
 * 105 concurrent requests to fonts.gstatic.com and betting the build on all of
 * them succeeding. One transient network blip killed a preview deploy on
 * 2026-08-11; the same dice roll applied to prod. (#978)
 *
 * Mirroring the chunks rather than subsetting the font ourselves keeps rendering
 * byte-identical to what Google served, and preserves the `unicode-range` split
 * so browsers still download only the chunks a page actually needs.
 *
 * Usage: node scripts/fetch-google-fonts.mjs
 *
 * Re-run this to pick up upstream font revisions (Google bumps the `vNN` path
 * segment). Commit whatever it changes under `public/fonts/` and `app/fonts/`.
 */

import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A modern desktop Chrome UA — Google serves woff2 only to browsers it knows
 * support it, and falls back to ttf otherwise. `next/font` does the same thing.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Keep `weights` in sync with the values the layouts used to pass to
 * `next/font/google`. Weight 600 is deliberately absent — it was dropped to cut
 * render-blocking CSS and `font-semibold` intentionally falls back to 500.
 * (#289, #713 — see the `--font-sans` comment in app/globals.css)
 */
const FONTS = [
  {
    family: 'Fraunces',
    weights: ['400', '500'],
    slug: 'fraunces',
    cssVar: '--font-fraunces',
    className: 'font-fraunces',
  },
  {
    family: 'Noto Sans TC',
    weights: ['400', '500'],
    slug: 'noto-sans-tc',
    cssVar: '--font-noto-tc',
    className: 'font-noto-tc',
  },
]

/**
 * The size-adjusted fallback faces `next/font/google` used to synthesise for us
 * (its `adjustFontFallback` option, on by default). They stretch a system font
 * to occupy the same box as the web font, so the `display: swap` handover
 * doesn't shift layout. Dropping them would have traded a build-time flake for
 * a permanent CLS regression, which is why they are reproduced here verbatim.
 *
 * Values come from Next's own precalculated table — reproduce with:
 *   node -e "console.log(require('next/dist/server/font-utils')
 *     .calculateSizeAdjustValues('Noto Sans TC'))"
 * Re-check them after a Next major upgrade; the table ships inside Next.
 */
const CAPTURED_FALLBACKS = new Map([
  [
    'Fraunces',
    `@font-face {
  font-family: 'Fraunces Fallback';
  src: local("Times New Roman");
  ascent-override: 84.71%;
  descent-override: 22.09%;
  line-gap-override: 0.00%;
  size-adjust: 115.45%;
}`,
  ],
  [
    'Noto Sans TC',
    `@font-face {
  font-family: 'Noto Sans TC Fallback';
  src: local("Arial");
  ascent-override: 110.73%;
  descent-override: 27.49%;
  line-gap-override: 0.00%;
  size-adjust: 104.76%;
}`,
  ],
])

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return res.text()
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

function googleCssUrl({ family, weights }) {
  const fam = family.replace(/ /g, '+')
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(';')}&display=swap`
}

async function mirrorFont(font) {
  const cssUrl = googleCssUrl(font)
  process.stdout.write(`\n${font.family}\n  CSS  ${cssUrl}\n`)
  const css = await fetchText(cssUrl)

  const urls = [...css.matchAll(/src:\s*url\((https:\/\/[^)]+)\)/g)].map((m) => m[1])
  const unique = [...new Set(urls)]
  process.stdout.write(`  ${css.match(/@font-face/g)?.length ?? 0} @font-face, ${unique.length} unique woff2\n`)

  const outDir = path.join(ROOT, 'public', 'fonts', font.slug)
  // Wipe first so a font revision that renames chunks doesn't leave orphans
  // behind — stale files would bloat the repo and never be referenced again.
  if (existsSync(outDir)) await rm(outDir, { recursive: true })
  await mkdir(outDir, { recursive: true })

  const rewrites = new Map()
  const seen = new Set()
  let bytes = 0

  // Sequential on purpose: `next/font` fired all 105 at once via Promise.all,
  // which is a big part of why a single blip took the whole build down. This
  // runs once by hand, so politeness beats speed.
  for (const [i, url] of unique.entries()) {
    let name = path.basename(new URL(url).pathname)
    if (seen.has(name)) throw new Error(`Duplicate basename ${name} from ${url}`)
    seen.add(name)

    const buf = await fetchBinary(url)
    bytes += buf.byteLength
    await writeFile(path.join(outDir, name), buf)
    rewrites.set(url, `/fonts/${font.slug}/${name}`)

    if ((i + 1) % 20 === 0 || i === unique.length - 1) {
      process.stdout.write(`  ${i + 1}/${unique.length} downloaded\n`)
    }
  }

  let out = css
  for (const [from, to] of rewrites) out = out.split(`url(${from})`).join(`url(${to})`)
  if (out.includes('https://fonts.gstatic.com')) {
    throw new Error(`${font.family}: CSS still references fonts.gstatic.com after rewrite`)
  }

  const fallback = CAPTURED_FALLBACKS.get(font.family)
  const stack = fallback
    ? `'${font.family}', '${font.family} Fallback'`
    : `'${font.family}'`

  const header =
    `/* GENERATED by scripts/fetch-google-fonts.mjs — do not edit by hand.\n` +
    ` * Mirrored from ${cssUrl}\n` +
    ` * ${unique.length} woff2 files, ${(bytes / 1048576).toFixed(2)} MB, self-hosted under /fonts/${font.slug}/.\n` +
    ` * Kept chunked so the unicode-range split still lets browsers fetch only\n` +
    ` * the ranges a page actually uses. (#978) */\n\n`

  const varBlock =
    `\n/* Scoped, not on :root — the layouts opt subtrees in by class, which is how\n` +
    ` * ${font.family} stays off the routes that don't need it. (#572) */\n` +
    `.${font.className} {\n  ${font.cssVar}: ${stack};\n}\n`

  const cssPath = path.join(ROOT, 'app', 'fonts', `${font.slug}.css`)
  await mkdir(path.dirname(cssPath), { recursive: true })
  await writeFile(cssPath, header + out.trimEnd() + '\n' + (fallback ? `\n${fallback}\n` : '') + varBlock)

  process.stdout.write(
    `  → public/fonts/${font.slug}/ (${(bytes / 1048576).toFixed(2)} MB)\n` +
    `  → app/fonts/${font.slug}.css\n`
  )
  return { family: font.family, files: unique.length, bytes }
}

const results = []
for (const font of FONTS) results.push(await mirrorFont(font))

const total = results.reduce((n, r) => n + r.bytes, 0)
process.stdout.write(
  `\nDone. ${results.reduce((n, r) => n + r.files, 0)} files, ` +
  `${(total / 1048576).toFixed(2)} MB total.\n`
)
