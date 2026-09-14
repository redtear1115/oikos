import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1198 — "which ink is legible on which ground" has, until now, lived only
 * as a code comment (`app/globals.css:14-16`, `:28-31`). A comment can drift:
 * someone re-lightens `--ink-3` for a different reason six months from now,
 * ships it, `tsc`/Tailwind/ESLint all pass, and the only trace that it used
 * to be AA-compliant is prose nobody re-reads at review time. This test
 * turns the claim into an assertion by parsing the actual palette out of
 * `app/globals.css`, implementing WCAG 2.x contrast math directly (no
 * dependency — this is exactly the kind of thing every color library gets
 * subtly wrong in a different way), and checking every ink/ground pairing
 * the design system leans on.
 *
 * Three value forms appear in the palette and all three have to be resolved
 * before contrast can be measured:
 *   - plain hex                                  (--ink: #3A2419)
 *   - rgba(...)                                   (--debit-soft: rgba(...))
 *     — composited over its ground before measuring, since a translucent
 *       tint has no contrast ratio of its own.
 *   - color-mix(in srgb, var(--a) N%, var(--b))   (--debit-text, --debit-quiet)
 *     — resolved recursively (its ingredients may themselves be var()s) and
 *       blended in sRGB, matching what `in srgb` actually means.
 *
 * Known-bad pairings (#1184, #1168, #1197) are encoded as PASSING assertions
 * on the current (still-broken) ratio, each named with its issue number —
 * not `it.fails` / `.skip`. Rationale: a skipped test is invisible in a
 * normal run and a red `it.fails` looks identical to accidental breakage in
 * CI output; a passing assertion on the *documented* bad number means the
 * suite only goes red the day someone actually changes the ratio (fixing it,
 * or making it worse) — at which point the failure is the prompt to update
 * this file deliberately, with the issue re-checked for closure. This is the
 * same shape as `reduced-motion.test.ts`'s existing-behavior assertions.
 */

const REPO_ROOT = process.cwd()
const css = readFileSync(join(REPO_ROOT, 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// ---------------------------------------------------------------------------
// WCAG 2.x contrast math — pure functions, no dependencies.
// ---------------------------------------------------------------------------

type RGB = { r: number; g: number; b: number; a: number }

function srgbToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Composite a (possibly translucent) color over an opaque ground. */
function compositeOver(fg: RGB, ground: RGB): RGB {
  const a = fg.a
  return {
    r: fg.r * a + ground.r * (1 - a),
    g: fg.g * a + ground.g * (1 - a),
    b: fg.b * a + ground.b * (1 - a),
    a: 1,
  }
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return { r, g, b, a: 1 }
}

// ---------------------------------------------------------------------------
// Palette parsing — resolve --name to an RGB(a), recursively through var()
// and color-mix(), by reading the actual definitions out of globals.css.
// ---------------------------------------------------------------------------

/** Raw declaration text (right-hand side, semicolon-trimmed) per --name,
 *  taken from the first `:root { ... }` block's direct declarations. Simple
 *  line-based extraction is enough here: every declaration in this file is
 *  `--name: value;` on its own logical line. */
const RAW: Record<string, string> = {}
for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
  const [, name, value] = m
  if (!(name in RAW)) RAW[name] = value.trim()
}

const resolveCache = new Map<string, RGB>()

function resolve(name: string): RGB {
  if (resolveCache.has(name)) return resolveCache.get(name)!
  const raw = RAW[name]
  if (!raw) throw new Error(`design-contrast test: no definition found for ${name} — palette parsing is out of date`)
  const rgb = resolveValue(raw)
  resolveCache.set(name, rgb)
  return rgb
}

function resolveValue(value: string): RGB {
  value = value.trim()

  // var(--name) or var(--name, fallback) — resolve the referenced property;
  // every token this suite touches is defined, so the fallback branch is not
  // needed for these specific pairings.
  const varMatch = value.match(/^var\(\s*(--[a-zA-Z0-9-]+)/)
  if (varMatch) return resolve(varMatch[1])

  // color-mix(in srgb, A N%, B [M%])
  const mixMatch = value.match(/^color-mix\(\s*in\s+srgb\s*,\s*(.+)\)$/)
  if (mixMatch) {
    const parts = splitTopLevelCommas(mixMatch[1])
    if (parts.length !== 2) throw new Error(`unexpected color-mix arity in: ${value}`)
    const [aPart, bPart] = parts
    const aPctMatch = aPart.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/)
    const bPctMatch = bPart.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)%$/)
    const aColorStr = aPctMatch ? aPctMatch[1] : aPart.trim()
    const bColorStr = bPctMatch ? bPctMatch[1] : bPart.trim()
    let aPct: number
    let bPct: number
    if (aPctMatch && bPctMatch) {
      aPct = parseFloat(aPctMatch[2])
      bPct = parseFloat(bPctMatch[2])
    } else if (aPctMatch) {
      aPct = parseFloat(aPctMatch[2])
      bPct = 100 - aPct
    } else if (bPctMatch) {
      bPct = parseFloat(bPctMatch[2])
      aPct = 100 - bPct
    } else {
      aPct = 50
      bPct = 50
    }
    const aColor = resolveValue(aColorStr)
    const bColor = resolveValue(bColorStr === 'transparent' ? 'rgba(0,0,0,0)' : bColorStr)
    const wa = aPct / (aPct + bPct)
    const wb = bPct / (aPct + bPct)
    return {
      r: aColor.r * wa + bColor.r * wb,
      g: aColor.g * wa + bColor.g * wb,
      b: aColor.b * wa + bColor.b * wb,
      a: aColor.a * wa + bColor.a * wb,
    }
  }

  // rgba(r, g, b, a) / rgb(r, g, b)
  const rgbaMatch = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    }
  }

  // named 'white' / '#fff' etc.
  if (value === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (value === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  // plain hex
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return hexToRgb(value)

  throw new Error(`design-contrast test: cannot resolve color value: "${value}"`)
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Contrast of an ink token against a ground token, compositing the ink over
 *  the ground first (handles translucent tokens like --debit-soft). */
function contrastOf(inkName: string, groundName: string): number {
  const ground = resolve(groundName)
  const inkRaw = resolve(inkName)
  const composited = compositeOver(inkRaw, ground)
  return contrastRatio(composited, ground)
}

// ---------------------------------------------------------------------------
// Sanity check: reproduce the two ratios globals.css already documents.
// ---------------------------------------------------------------------------

describe('design-contrast — math sanity check against documented figures', () => {
  it('reproduces --ink-3 on --bg ≈ 4.66:1 (globals.css:14-16)', () => {
    const ratio = contrastOf('--ink-3', '--bg')
    console.log(`[design-contrast] --ink-3 on --bg = ${ratio.toFixed(3)}:1 (documented: ~4.66:1)`)
    expect(Math.abs(ratio - 4.66)).toBeLessThan(0.05)
  })

  it('reproduces --debit-text on --debit-soft (over cream) ≈ 4.87:1 (globals.css:28-31)', () => {
    // --debit-soft is a translucent tint used as an "error message bg", which
    // renders on card surfaces — --surface-alt (#FFF6EC), the warmer cream
    // used under content cards, not the app-shell --bg. Composited there,
    // the raw --debit-on-tint ratio (~2.77) matches the comment's "plain
    // --debit fails AA at ~2.7:1", confirming this is the right ground.
    const cream = resolve('--surface-alt')
    const debitSoftOverCream = compositeOver(resolve('--debit-soft'), cream)
    const debitText = resolve('--debit-text')
    const ratio = contrastRatio(compositeOver(debitText, debitSoftOverCream), debitSoftOverCream)
    console.log(`[design-contrast] --debit-text on --debit-soft-over-cream = ${ratio.toFixed(3)}:1 (documented: ~4.87:1)`)
    expect(Math.abs(ratio - 4.87)).toBeLessThan(0.05)
  })
})

// ---------------------------------------------------------------------------
// The pairings the design system actually relies on.
// ---------------------------------------------------------------------------

const GROUNDS = ['--bg', '--bg-committed', '--surface', '--surface-alt']
const INKS = ['--ink', '--ink-2', '--ink-3', '--debit-text', '--debit-quiet', '--credit', '--accent', '--destructive', '--on-fill']

const NORMAL_TEXT_MIN = 4.5
const GRAPHICAL_MIN = 3

/** The full ink x ground matrix, computed once and printed for
 *  discoverability regardless of which assertions below pass or fail. */
const matrix: Record<string, Record<string, number>> = {}
for (const ink of INKS) {
  matrix[ink] = {}
  for (const ground of GROUNDS) {
    matrix[ink][ground] = contrastOf(ink, ground)
  }
}

describe('design-contrast — full ink x ground matrix (informational)', () => {
  it('prints the matrix', () => {
    const colWidth = 10
    const header = 'ink'.padEnd(16) + GROUNDS.map((g) => g.padStart(colWidth)).join('')
    const rows = INKS.map(
      (ink) => ink.padEnd(16) + GROUNDS.map((g) => matrix[ink][g].toFixed(2).padStart(colWidth)).join('')
    )
    console.log(`\n[design-contrast] ink x ground matrix (ratio, higher = more contrast)\n${header}\n${rows.join('\n')}\n`)
    expect(matrix['--ink']['--bg']).toBeGreaterThan(0)
  })
})

describe('design-contrast — pairings the system claims are safe', () => {
  it('--ink on --bg clears normal-text AA', () => {
    expect(contrastOf('--ink', '--bg')).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('--ink-3 on --bg clears normal-text AA (4.66:1, darkened from #B89C8B per globals.css:14-16)', () => {
    expect(contrastOf('--ink-3', '--bg')).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('--ink-3 on --surface clears normal-text AA (~5.35:1)', () => {
    expect(contrastOf('--ink-3', '--surface')).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('--ink-2 on --bg clears normal-text AA', () => {
    expect(contrastOf('--ink-2', '--bg')).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('--debit-text on --debit-soft (over cream/--surface-alt) clears normal-text AA (~4.87:1, globals.css:28-31)', () => {
    const cream = resolve('--surface-alt')
    const ground = compositeOver(resolve('--debit-soft'), cream)
    const ratio = contrastRatio(compositeOver(resolve('--debit-text'), ground), ground)
    expect(ratio).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('--on-fill (white) on --ink clears normal-text AA — primary button text', () => {
    expect(contrastOf('--on-fill', '--ink')).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('--destructive on --bg clears graphical-object AA (3:1) for destructive-action iconography', () => {
    expect(contrastOf('--destructive', '--bg')).toBeGreaterThanOrEqual(GRAPHICAL_MIN)
  })
})

describe('design-contrast — known-bad pairings, encoded as passing assertions on the current (broken) ratio', () => {
  // Each assertion pins today's actual ratio. If someone changes the
  // underlying token values, the ratio here will no longer match and the
  // test goes red — which is the prompt to come back, recheck whether the
  // linked issue is now resolved, and update (or delete) the assertion
  // deliberately rather than let a stale "known bad" comment rot silently.

  it('#1184 — --ink-3 on --bg-committed is below 4.5:1 (~4.03:1); still fine on --bg (4.66) and --surface (5.35) — the ground-dependent split IS the point', () => {
    const onCommitted = contrastOf('--ink-3', '--bg-committed')
    const onBg = contrastOf('--ink-3', '--bg')
    const onSurface = contrastOf('--ink-3', '--surface')
    console.log(
      `[design-contrast] #1184 --ink-3: on --bg-committed=${onCommitted.toFixed(2)}, on --bg=${onBg.toFixed(2)}, on --surface=${onSurface.toFixed(2)}`
    )
    expect(Math.abs(onCommitted - 4.03)).toBeLessThan(0.05)
    expect(onCommitted).toBeLessThan(NORMAL_TEXT_MIN)
    expect(onBg).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
    expect(onSurface).toBeGreaterThanOrEqual(NORMAL_TEXT_MIN)
  })

  it('#1168 — white / --on-fill on --debit is below 4.5:1 (~3.27:1); swapping to --on-fill does not help, it is the same colour', () => {
    const ratio = contrastOf('--on-fill', '--debit')
    console.log(`[design-contrast] #1168 --on-fill on --debit = ${ratio.toFixed(2)}:1`)
    expect(Math.abs(ratio - 3.27)).toBeLessThan(0.05)
    expect(ratio).toBeLessThan(NORMAL_TEXT_MIN)
    // Confirm the "same colour" premise directly: --on-fill IS #fff.
    expect(resolve('--on-fill')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })

  it('#1197 — white on --accent is below 4.5:1 (~2.68:1), on the settlement commit button', () => {
    const ratio = contrastOf('--on-fill', '--accent')
    console.log(`[design-contrast] #1197 --on-fill on --accent = ${ratio.toFixed(2)}:1`)
    expect(Math.abs(ratio - 2.68)).toBeLessThan(0.05)
    expect(ratio).toBeLessThan(NORMAL_TEXT_MIN)
  })
})
