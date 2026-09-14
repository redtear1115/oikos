import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #1198 — a `var(--x)` reference is invisible to every other checker in the
 * toolchain: `tsc` does not know CSS custom properties exist, Tailwind
 * accepts `text-[var(--anything)]` as valid arbitrary-value syntax whether or
 * not `--anything` is ever defined, ESLint does not parse CSS, and the design
 * detector only diffs literal numeric values — a `var()` gives it nothing to
 * compare. So a token can be renamed or typo'd, ship, and sit there for
 * months looking completely normal: the class still applies, the browser
 * still lays out a box, it just silently falls back to the inherited value
 * (or, with no fallback, to nothing at all) instead of erroring.
 *
 * This test is the toolchain's missing link: it parses every custom-property
 * *definition* in `app/**.css` (plus the one runtime-only exception written
 * via `element.style.setProperty`), then walks `app/**` and `components/**`
 * for every `var(--name)` reference and asserts each name resolves to a
 * definition somewhere.
 */

const REPO_ROOT = process.cwd()

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** All `.css` files directly under `app/` (there are three: globals.css and
 *  the two generated font files under app/fonts/). */
function cssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) cssFiles(full, out)
    else if (full.endsWith('.css')) out.push(full)
  }
  return out
}

const APP_CSS_FILES = cssFiles(join(REPO_ROOT, 'app'))

/** Every `--name:` declaration (a definition, not a reference) across the
 *  app's CSS files, comments stripped first so a name mentioned only in prose
 *  doesn't count as a definition. */
const DEFINED_PROPS = new Set<string>()
for (const file of APP_CSS_FILES) {
  const css = stripComments(readFileSync(file, 'utf8'))
  for (const m of css.matchAll(/(^|[;{\s])(--[a-zA-Z0-9-]+)\s*:/g)) {
    DEFINED_PROPS.add(m[2])
  }
}

/** Runtime-only definitions: properties set via
 *  `document.documentElement.style.setProperty('--x', ...)` outside CSS.
 *  There is exactly one today (`--top-stack-h` in ShellTopStack.tsx), which
 *  also happens to have a CSS default — scanned anyway so this rule keeps
 *  working the day a JS-only variable (no CSS fallback at all) shows up. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const SOURCE_DIRS = ['app', 'components'].map((d) => join(REPO_ROOT, d))
const tsxFiles = SOURCE_DIRS.flatMap((dir) => sourceFiles(dir))

const JS_DEFINED_PROPS = new Set<string>()
for (const file of tsxFiles) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\.style\.setProperty\(\s*['"](--[a-zA-Z0-9-]+)['"]/g)) {
    JS_DEFINED_PROPS.add(m[1])
  }
}

console.log(
  `[design-token-integrity] properties defined only via JS setProperty: ${
    [...JS_DEFINED_PROPS].filter((p) => !DEFINED_PROPS.has(p)).join(', ') || '(none — all also have a CSS definition)'
  }`
)
console.log(`[design-token-integrity] all setProperty targets seen: ${[...JS_DEFINED_PROPS].join(', ') || '(none)'}`)

for (const p of JS_DEFINED_PROPS) DEFINED_PROPS.add(p)

/** All CSS files (app/**) plus all .ts/.tsx files (app/**, components/**),
 *  as the corpus to scan for `var(--x)` references — Tailwind arbitrary
 *  values (`text-[var(--fs-sm)]`) and inline `style={{ }}` included, since
 *  both are just `var(...)` substrings from the regex's point of view. */
const cssSourceFiles = [
  ...APP_CSS_FILES,
  ...cssFiles(join(REPO_ROOT, 'components')).filter(() => {
    // components/ has no .css files today, but keep the walk symmetrical.
    return true
  }),
]
const scanFiles = [...new Set([...cssSourceFiles, ...tsxFiles])]

interface VarRef {
  name: string
  hasFallback: boolean
  file: string
  line: number
}

const VAR_REF_RE = /var\(\s*(--[a-zA-Z0-9-]+)\s*(,[^)]*)?\)/g

const refs: VarRef[] = []
for (const file of scanFiles) {
  const raw = readFileSync(file, 'utf8')
  const text = file.endsWith('.css') ? stripComments(raw) : raw
  const relPath = relative(REPO_ROOT, file)
  const lines = text.split('\n')
  lines.forEach((lineText, idx) => {
    for (const m of lineText.matchAll(VAR_REF_RE)) {
      refs.push({
        name: m[1],
        hasFallback: !!m[2],
        file: relPath,
        line: idx + 1,
      })
    }
  })
}

describe('design-token-integrity — every var(--x) resolves', () => {
  it('references a defined custom property', () => {
    const undefinedRefs = refs.filter((r) => !DEFINED_PROPS.has(r.name))
    const messages = undefinedRefs.map(
      (r) => `${r.file}:${r.line} references undefined property ${r.name}${r.hasFallback ? ' (has fallback)' : ' (NO FALLBACK)'}`
    )
    expect(messages, messages.join('\n')).toEqual([])
  })

  it('LOUDER: a reference with NO fallback must be defined — a missing fallback means the whole declaration drops, silently reverting to the inherited value', () => {
    const undefinedNoFallback = refs.filter((r) => !r.hasFallback && !DEFINED_PROPS.has(r.name))
    const messages = undefinedNoFallback.map((r) => `${r.file}:${r.line} — undefined property ${r.name}, no fallback`)
    expect(messages, messages.join('\n')).toEqual([])
  })

  // Informational only, not a hard failure: a `var(--x, <hex literal>)` where
  // --x IS defined means the hex fallback is currently unreachable dead code
  // — it will only ever be used if --x is later renamed or removed. That is
  // a much lower-stakes situation than an actually-undefined reference (the
  // two hard assertions above), and flagging it as a failure would punish a
  // defensive habit that is arguably good practice. So: report, don't assert.
  it('reports (informationally) fallback-with-defined-token cases — dead code, not a bug', () => {
    const hexFallbackRefs: string[] = []
    for (const file of scanFiles) {
      const raw = readFileSync(file, 'utf8')
      const text = file.endsWith('.css') ? stripComments(raw) : raw
      const relPath = relative(REPO_ROOT, file)
      const lines = text.split('\n')
      lines.forEach((lineText, idx) => {
        for (const m of lineText.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g)) {
          if (DEFINED_PROPS.has(m[1])) {
            hexFallbackRefs.push(`${relPath}:${idx + 1} var(${m[1]}, ${m[2]}) — ${m[1]} is defined, hex fallback is dead code`)
          }
        }
      })
    }
    console.log(`[design-token-integrity] dead hex fallbacks (informational only):\n${hexFallbackRefs.join('\n') || '(none found)'}`)
    // Soft expectation only — does not fail the suite.
    expect(hexFallbackRefs.length).toBeGreaterThanOrEqual(0)
  })
})
