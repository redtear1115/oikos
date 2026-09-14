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
 * Boundaries (what this does NOT see):
 * - It is family-agnostic. It cannot tell which font-family an element
 *   resolves to, so it holds every request to the Noto Sans TC set — including
 *   elements on `--font-numeric` (system SF, which does ship 600/700). That is
 *   deliberate (#1167 decision: the whole app speaks 400/500), not a claim
 *   that the system font lacks those faces. Fraunces is asserted to ship the
 *   same set, so one allowed set is valid for both self-hosted families.
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
  text.split('\n').forEach((line, idx) => {
    const where = `${rel}:${idx + 1}`
    // Inline style object: fontWeight: <expr>
    for (const m of line.matchAll(/\bfontWeight\s*:\s*([^,}\n]+)/g)) {
      requests.push({ where, source: m[0].trim(), weights: weightsInExpression(m[1]) })
    }
    // JSX / SVG attribute: fontWeight="600" or fontWeight={600}
    for (const m of line.matchAll(/\bfontWeight=(?:"([^"]*)"|\{([^}]*)\})/g)) {
      requests.push({ where, source: m[0], weights: weightsInExpression(m[1] ?? m[2]) })
    }
    // CSS declaration: font-weight: <value>
    for (const m of line.matchAll(/(?<![\w-])font-weight\s*:\s*([^;}\n]+)/g)) {
      requests.push({ where, source: m[0].trim(), weights: weightsInExpression(m[1]) })
    }
    // Tailwind utility: font-semibold / font-[600]
    for (const m of line.matchAll(
      /(?<![\w-])font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])(?![\w-])/g
    )) {
      const token = m[1]
      const w = token.startsWith('[') ? Number(token.slice(1, -1)) : TAILWIND_WEIGHTS[token]
      requests.push({ where, source: m[0], weights: [w] })
    }
  })
}

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

  it('requests only weights that are loaded', () => {
    const allowed = [...NOTO_WEIGHTS].sort().join('/')
    const bad = requests
      .filter((r) => r.weights !== null && r.weights.some((w) => !NOTO_WEIGHTS.has(w)))
      .map((r) => `${r.where} — ${r.source} (loaded: ${allowed})`)
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('has no weight expression it cannot evaluate', () => {
    const unverifiable = requests
      .filter((r) => r.weights === null)
      .map((r) => `${r.where} — ${r.source} (use literal weights so this test can check them)`)
    expect(unverifiable, unverifiable.join('\n')).toEqual([])
  })
})
