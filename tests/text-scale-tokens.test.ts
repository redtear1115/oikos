import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

// #1490 — Tailwind must emit calc(<rem> * var(--text-scale, 1)) for the body
// tiers and keep the headline/amount tiers static. globals.css once said
// "@theme inline needs static values"; this is the proof that the calc form is
// emitted verbatim (failure looks like: text-sm silently stays 14px on iOS at
// the largest text size, no error anywhere).

const ROOT = path.resolve(__dirname, '..')

describe('text tokens compile', () => {
  it('scales body tiers and leaves headline tiers static', async () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8')
    const out = (await postcss([tailwind({ base: ROOT })]).process(css, { from: 'app/globals.css' })).css
    const rule = (cls: string) => out.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))?.[1].replace(/\s+/g, ' ') ?? ''
    const expected: Record<string, string> = {
      'text-xs': '0.75rem', 'text-sm': '0.875rem', 'text-base': '1rem',
      'text-lg': '1.125rem', 'text-xl': '1.25rem', 'text-mini': '0.625rem',
    }
    for (const [cls, rem] of Object.entries(expected)) {
      expect(rule(cls), cls).toContain(`font-size: calc(${rem} * var(--text-scale, 1))`)
    }
    for (const [cls, px] of Object.entries({ 'text-title': '22px', 'text-page': '26px', 'text-amount-md': '44px', 'text-amount-lg': '56px' })) {
      expect(rule(cls), cls).toContain(`font-size: ${px}`)
      expect(rule(cls), cls).not.toContain('text-scale')
    }
  }, 60_000)

  // #1514 - the one scoped exception: bottom-nav label follows --text-scale but
  // is capped at 1.3x; the nav tab and the list row are em-based containers.
  it('caps the nav label scale and emits em container conditions', async () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8')
    const out = (await postcss([tailwind({ base: ROOT })]).process(css, { from: 'app/globals.css' })).css
    const flat = out.replace(/\s+/g, ' ')
    expect(flat).toMatch(/\.text-nav-label \{[^}]*font-size: calc\(0\.875rem \* min\(var\(--text-scale, 1\), 1\.3\)\)/)
    expect(flat).toMatch(/@container \(width < 16em\)/)
    expect(flat).toMatch(/@container \(width < 4em\)/)
  }, 60_000)
})
