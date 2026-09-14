import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #1167 — a font-weight request is invisible to every other checker in the
 * toolchain: `tsc` types `fontWeight` as `string | number`, Tailwind happily
 * emits `font-semibold`, ESLint does not know which faces were self-hosted,
 * and the design detector only diffs font sizes. So a component can ask for
 * 600 while `app/fonts/noto-sans-tc.css` ships only 400 and 500, and nothing
 * errors.
 *
 * What that looks like when it slips through: two states that were meant to
 * differ by weight (`sel ? 600 : 500`) render identically — the tab looks
 * like it didn't switch — or, on a platform that synthesizes bold, the CJK
 * label comes out smeared. `globals.css` now sets `font-synthesis-weight:
 * none`, which removes the smear but guarantees the first symptom, so the
 * only real defence is not requesting unloaded weights at all.
 *
 * This test parses the weights actually declared by the self-hosted
 * `@font-face` files, then walks `app/**`, `components/**`, `lib/**` for
 * every weight request and asserts each one is in the loaded set.
 *
 * The one exception: `--font-numeric` (`-apple-system, 'SF Pro Display',
 * system-ui`) is a *system* family, and the system family does ship a real
 * 600. Amounts are the app's loudest element and they are set in it, so they
 * are allowed 600 (#1167 decision, 2026-09-15). The exception is granted
 * structurally, not by a line list: a weight request counts as numeric only
 * when the element's own `style={{ … }}` object or `className` names
 * `font-numeric`. Inheriting it from an ancestor does not qualify — the test
 * cannot follow that, and neither can a reader skimming the component.
 *
 * Why that narrowness matters: the failure it prevents is silent in both
 * directions. Put 600 on CJK text and the glyphs quietly fall back to the 500
 * face (a selected tab stops looking selected) or get synthesized into smeared
 * strokes on platforms that still fake bold. Neither raises an error, and both
 * look plausible in a screenshot.
 *
 * Boundaries (what this does NOT see):
 * - Family resolution beyond that one literal marker. An element on
 *   `--font-numeric` by inheritance is held to 400/500; that is a false
 *   negative the test accepts in exchange for a rule you can check by eye.
 *   Fraunces is asserted to ship the same set as Noto Sans TC, so one allowed
 *   set is valid for both self-hosted families.
 * - Implicit weights: `<strong>` / `<b>` (preflight `bolder`), UA-bold elements
 *   like `<th>`, and markup inside i18n `*Html` strings are not scanned.
 *   Those resolve to the nearest loaded face (500) and, with synthesis off,
 *   are never faked bold.
 * - Weights computed from a variable (`fontWeight: w`) cannot be evaluated;
 *   such an expression fails the test as unverifiable rather than passing
 *   silently — rewrite it with literal values.
 */

const REPO_ROOT = process.cwd()

function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

function loadedWeights(cssPath: string): Set<number> {
  const css = stripCssComments(readFileSync(join(REPO_ROOT, cssPath), 'utf8'))
  const out = new Set<number>()
  for (const face of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const m = face[1].match(/font-weight:\s*(\d+)(?:\s+(\d+))?/)
    if (!m) continue
    // A variable-font range (`font-weight: 100 900`) would load every weight in
    // between; expand it so the allowed set stays truthful if that ever lands.
    const lo = Number(m[1])
    const hi = m[2] ? Number(m[2]) : lo
    for (let w = lo; w <= hi; w += 100) out.add(w)
  }
  return out
}

const NOTO_WEIGHTS = loadedWeights('app/fonts/noto-sans-tc.css')
const FRAUNCES_WEIGHTS = loadedWeights('app/fonts/fraunces.css')

const TAILWIND_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
}

const KEYWORD_WEIGHTS: Record<string, number> = { normal: 400, bold: 700 }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (full === join(REPO_ROOT, 'app', 'fonts')) continue // the face declarations themselves
      walk(full, out)
    } else if (/\.(tsx?|css)$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

const scanFiles = ['app', 'components', 'lib'].flatMap((d) => walk(join(REPO_ROOT, d)))

interface WeightRequest {
  where: string
  source: string
  /** null = the expression carried no evaluable weight */
  weights: number[] | null
  /** the element literally names the numeric (system) family */
  numeric: boolean
}

/** Byte ranges of every `style={{ … }}` object and every `className="…"` /
 *  `className={…}` value in a file, paired with whether that text names the
 *  numeric family. A weight request inside a range marked true is the element
 *  that also sets the family, which is the only shape that earns the 600
 *  exception. */
function numericRanges(text: string): [number, number][] {
  const ranges: [number, number][] = []
  const openers = /(style=\{\{|className=\{|className=")/g
  for (const m of text.matchAll(openers)) {
    const start = m.index!
    let i = start + m[0].length
    if (m[0] === 'className="') {
      const end = text.indexOf('"', i)
      if (end === -1) continue
      if (/font-numeric/.test(text.slice(start, end))) ranges.push([start, end])
      continue
    }
    // Brace depth the opener already consumed: `style={{` opens two, a
    // `className={` expression one. Getting this wrong is exactly the kind of
    // silent failure this file is about — an over-counted depth runs the scan
    // past the closing brace and swallows the following siblings, so unrelated
    // elements inherit the numeric exception and a 600 on CJK text sails
    // through a green suite.
    let depth = m[0] === 'style={{' ? 2 : 1
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') depth--
      i++
    }
    if (/--font-numeric|font-numeric/.test(text.slice(start, i))) ranges.push([start, i])
  }
  return ranges
}

/** Pull every weight literal out of an inline/CSS value expression, e.g.
 *  `sel ? 600 : 500` → [600, 500]; `'bold'` → [700]; `inherit` → []. */
function weightsInExpression(expr: string): number[] | null {
  const trimmed = expr.trim()
  if (/^['"]?(inherit|initial|unset)['"]?$/.test(trimmed)) return []
  const nums = [...trimmed.matchAll(/(?<![\w.-])([1-9]00)(?![\w.])/g)].map((m) => Number(m[1]))
  const keywords = [...trimmed.matchAll(/['"]?\b(normal|bold|bolder|lighter)\b['"]?/g)].map((m) =>
    m[1] in KEYWORD_WEIGHTS ? KEYWORD_WEIGHTS[m[1]] : -1
  )
  const all = [...nums, ...keywords]
  if (all.length === 0 || all.includes(-1)) return null
  return all
}

const requests: WeightRequest[] = []
for (const file of scanFiles) {
  const raw = readFileSync(file, 'utf8')
  const text = file.endsWith('.css') ? stripCssComments(raw) : raw
  const rel = relative(REPO_ROOT, file)
  const ranges = file.endsWith('.css') ? [] : numericRanges(text)
  const isNumeric = (offset: number) => ranges.some(([a, b]) => offset >= a && offset <= b)

  let offset = 0
  text.split('\n').forEach((line, idx) => {
    const lineStart = offset
    offset += line.length + 1
    const where = `${rel}:${idx + 1}`
    const push = (index: number, source: string, weights: number[] | null) =>
      requests.push({ where, source, weights, numeric: isNumeric(lineStart + index) })

    // Inline style object: fontWeight: <expr>
    for (const m of line.matchAll(/\bfontWeight\s*:\s*([^,}\n]+)/g)) {
      push(m.index!, m[0].trim(), weightsInExpression(m[1]))
    }
    // JSX / SVG attribute: fontWeight="600" or fontWeight={600}
    for (const m of line.matchAll(/\bfontWeight=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      push(m.index!, m[0], weightsInExpression(m[1] ?? m[2]))
    }
    // CSS declaration: font-weight: <value>
    for (const m of line.matchAll(/(?<![\w-])font-weight\s*:\s*([^;}\n]+)/g)) {
      push(m.index!, m[0].trim(), weightsInExpression(m[1]))
    }
    // Tailwind utility: font-semibold / font-[600]
    for (const m of line.matchAll(
      /(?<![\w-])font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])(?![\w-])/g
    )) {
      const token = m[1]
      const w = token.startsWith('[') ? Number(token.slice(1, -1)) : TAILWIND_WEIGHTS[token]
      push(m.index!, m[0], [w])
    }
  })
}

/** Weights the system numeric family ships beyond the self-hosted set. */
const NUMERIC_EXTRA = new Set([600])

describe('font-weight-loaded — every weight request has a self-hosted face (#1167)', () => {
  it('parses a non-empty loaded set from the Noto Sans TC face file', () => {
    expect([...NOTO_WEIGHTS].sort()).not.toHaveLength(0)
  })

  it('Fraunces ships the same weights as Noto Sans TC, so one allowed set covers both', () => {
    expect([...FRAUNCES_WEIGHTS].sort()).toEqual([...NOTO_WEIGHTS].sort())
  })

  it('finds weight requests to check (guards against the scanner silently matching nothing)', () => {
    expect(requests.length).toBeGreaterThan(20)
  })

  it('text elements request only weights that are loaded', () => {
    const allowed = [...NOTO_WEIGHTS].sort().join('/')
    const bad = requests
      .filter((r) => !r.numeric && r.weights !== null && r.weights.some((w) => !NOTO_WEIGHTS.has(w)))
      .map(
        (r) =>
          `${r.where} — ${r.source}\n    self-hosted faces: ${allowed}. This element does not name ` +
          `font-numeric, so it renders in Noto Sans TC / Fraunces. Asking for anything else is ` +
          `silent: the glyphs fall back to the nearest loaded face (a "selected" state stops ` +
          `looking selected) or, where bold is synthesized, CJK strokes smear together. ` +
          `Only amounts on --font-numeric may use 600.`
      )
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('numeric elements may use 600 — and nothing beyond what the system family ships', () => {
    // The exception exists because --font-numeric is `-apple-system, 'SF Pro
    // Display', system-ui`: a system family with a real 600, unlike the
    // self-hosted webfonts. Amounts are the app's loudest element and are set
    // in it, so 600 there is a genuine face, not a fallback (#1167,
    // 2026-09-15). It stays this narrow so it cannot quietly spread to text:
    // the marker must be on the element itself.
    const allowed = new Set([...NOTO_WEIGHTS, ...NUMERIC_EXTRA])
    const bad = requests
      .filter((r) => r.numeric && r.weights !== null && r.weights.some((w) => !allowed.has(w)))
      .map((r) => `${r.where} — ${r.source} (numeric element; allowed: ${[...allowed].sort().join('/')})`)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('the numeric exception covers the amount displays and nothing else', () => {
    // A named inventory, so that a 600 quietly appearing on a new element is
    // visible in the diff rather than absorbed by the rule above.
    const sites = requests
      .filter((r) => r.numeric && r.weights?.some((w) => NUMERIC_EXTRA.has(w)))
      .map((r) => r.where.replace(/:\d+$/, ''))
    expect([...new Set(sites)].sort()).toEqual([
      'app/(dashboard)/_components/AmountInput.tsx',
      'app/(dashboard)/dashboard/_components/BalanceHero.tsx',
      'app/(dashboard)/dashboard/_components/MiniCalendar.tsx',
      'app/(dashboard)/dashboard/_components/SettlementForm.tsx',
    ])
  })

  it('has no weight expression it cannot evaluate', () => {
    const unverifiable = requests
      .filter((r) => r.weights === null)
      .map((r) => `${r.where} — ${r.source} (use literal weights so this test can check them)`)
    expect(unverifiable, unverifiable.join('\n')).toEqual([])
  })
})
