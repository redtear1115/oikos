import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * #1022 — every animation is removable, and removing it does not remove the
 * message.
 *
 * `PRODUCT.md` promises motion that is "gentle by default and fully removable";
 * three of the five animations in globals.css were only half of that. These
 * tests hold the whole surface: each animated class must have a
 * `prefers-reduced-motion: reduce` branch, the realtime pair must still say
 * something in that branch, and nothing may smuggle an animation past the CSS
 * layer through an inline style (where no media query can reach it).
 */

/** Vitest runs from the repo root. */
const REPO_ROOT = process.cwd()
const rawCss = readFileSync(join(REPO_ROOT, 'app/globals.css'), 'utf8')
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')

const REDUCE_HEADER = '@media (prefers-reduced-motion: reduce)'

/** Every `{ ... }` body that follows `header`, brace-matched. */
function blocksAfter(source: string, header: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf(header, from)
    if (start === -1) return out
    const open = source.indexOf('{', start)
    let depth = 0
    let end = open
    for (; end < source.length; end++) {
      if (source[end] === '{') depth++
      else if (source[end] === '}' && --depth === 0) break
    }
    out.push(source.slice(open + 1, end))
    from = end + 1
  }
}

/** Top-level `selector { body }` rules; at-rule blocks (@keyframes, @media,
 *  @theme, @utility) are skipped rather than descended into. */
function topLevelRules(source: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = []
  let head = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '{') {
      let depth = 0
      let end = i
      for (; end < source.length; end++) {
        if (source[end] === '{') depth++
        else if (source[end] === '}' && --depth === 0) break
      }
      const selector = head.trim()
      if (selector && !selector.startsWith('@')) {
        rules.push({ selector, body: source.slice(i + 1, end) })
      }
      head = ''
      i = end + 1
      continue
    }
    if (ch === '}') {
      head = ''
      i++
      continue
    }
    head += ch
    i++
  }
  return rules
}

const reduceBlocks = blocksAfter(css, REDUCE_HEADER)
const reduceCss = reduceBlocks.join('\n')

/** The full animated surface of globals.css. Adding an animation without
 *  adding it here fails the "no animation escapes the audit" test below. */
const ANIMATED_CLASSES = [
  '.partner-toast',
  '.about-article',
  '.rt-flash',
  '.rt-fading',
  '.strip-fading',
  '.animate-blink',
]

describe('globals.css — reduced-motion coverage', () => {
  it.each(ANIMATED_CLASSES)('%s has a prefers-reduced-motion branch', (cls) => {
    expect(css).toContain(`${cls} {`)
    expect(reduceBlocks.some((block) => block.includes(`${cls} {`))).toBe(true)
  })

  it('leaves no animated class outside the audit list', () => {
    const animated = topLevelRules(css)
      .filter((rule) => /(^|[;\s])animation\s*:/.test(rule.body))
      .map((rule) => rule.selector)
      .sort()
    expect(animated).toEqual([...ANIMATED_CLASSES].sort())
  })
})

describe('globals.css — reduced motion keeps the message', () => {
  it('still tells the realtime flash, as a held tint instead of a fade', () => {
    // Silence would be the wrong answer: this is the one moment the product
    // shows "the other person just moved". step-end means no interpolation —
    // a flat state that appears and then leaves in a single frame.
    const flashHold = blocksAfter(css, '@keyframes rt-flash-hold').join('\n')
    expect(flashHold).toContain('var(--realtime-flash)')
    expect(reduceCss).toMatch(/\.rt-flash\s*\{[^}]*animation:\s*rt-flash-hold[^}]*step-end/)
  })

  it('keeps a removed row visible while it is being removed', () => {
    // TransactionFeed drops the row 500ms after adding .rt-fading. Without a
    // collapse to watch, the row has to stay on screen and legible, just
    // dimmed, so the disappearance still has a visible cause.
    const fading = reduceCss.match(/\.rt-fading\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(fading).toMatch(/animation:\s*none/)
    const opacity = Number(fading.match(/opacity:\s*([\d.]+)/)?.[1])
    expect(opacity).toBeGreaterThan(0)
    expect(opacity).toBeLessThan(1)
  })

  it('parks the amount caret in its visible state', () => {
    // The only `infinite` animation in the app — the one that never stops
    // unless reduced motion stops it.
    expect(css).toMatch(/\.animate-blink\s*\{\s*animation:\s*blink[^}]*infinite/)
    expect(reduceCss).toMatch(/\.animate-blink\s*\{[^}]*animation:\s*none[^}]*opacity:\s*1/)
  })
})

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const SOURCE_DIRS = ['app', 'components'].map((d) => join(REPO_ROOT, d))
const sources = SOURCE_DIRS.flatMap((dir) => sourceFiles(dir)).map((file) => ({
  path: relative(REPO_ROOT, file),
  text: readFileSync(file, 'utf8'),
}))

describe('no animation bypasses the CSS layer', () => {
  it('declares no animation shorthand in an inline style', () => {
    // An inline style beats every stylesheet rule, so a media query can never
    // take such an animation back. (`animationDelay` alongside a class-driven
    // animation is fine — it is the shorthand that escapes.)
    const offenders = sources
      .filter(({ text }) => /style=\{\{[^}]*\banimation\s*:/.test(text))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })

  it('pairs every component-local stylesheet animation with a reduce branch', () => {
    // Either spelling counts: a raw `@media (prefers-reduced-motion: reduce)`
    // in the component's own <style>, or Tailwind's `motion-reduce:` variant.
    const offenders = sources
      .filter(({ text }) => text.includes('@keyframes'))
      .filter(({ text }) => !text.includes('prefers-reduced-motion') && !text.includes('motion-reduce:'))
      .map(({ path }) => path)
    expect(offenders).toEqual([])
  })
})
