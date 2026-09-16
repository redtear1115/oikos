import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1278 — guard against reintroducing arbitrary px type scale, or bare
 * `text-white`, into app/[locale]/use-case and app/[locale]/migrate.
 * Those two subtrees were swept clean in #1278; this test fails loudly
 * if a future edit brings a hit back.
 *
 * Deliberately blunt: fails on ANY `text-[<n>px]` class (integer or
 * decimal, any value — not just the previously-deprecated 12/13/15.5/
 * 17/18/20/22/32/44), ANY `fontSize:` numeric or px-string literal, and
 * any bare `text-white`. The scale should be expressed through the
 * existing `text-*` tokens, not arbitrary px classes.
 *
 * What failure looks like if this guard is missing: #1066 shipped a
 * numeric `fontSize: 13` that slipped through review because nothing
 * grepped for it — the drift from the landing token scale is visually
 * invisible (a couple of px), so it doesn't get caught by eyeballing a
 * screenshot; it only shows up as a silent, permanent fork from the
 * rest of the app's type scale.
 */

const ROOTS = ['app/[locale]/use-case', 'app/[locale]/migrate']

function listTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...listTsxFiles(full))
    } else if (entry.endsWith('.tsx')) {
      files.push(full)
    }
  }
  return files
}

const FONT_SIZE_RE = /fontSize:\s*['"]?[0-9]/
const ARBITRARY_TEXT_PX_RE = /text-\[\d+(\.\d+)?px\]/
const TEXT_WHITE_RE = /\btext-white\b/

describe('use-case / migrate type scale guard (#1278)', () => {
  const files = ROOTS.flatMap((root) => listTsxFiles(join(process.cwd(), root)))

  it('found files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const relative = file.replace(process.cwd() + '/', '')
    it(`${relative} has no arbitrary type-scale or text-white literals`, () => {
      const content = readFileSync(file, 'utf-8')
      const hits: string[] = []
      content.split('\n').forEach((line, i) => {
        if (FONT_SIZE_RE.test(line)) hits.push(`L${i + 1}: fontSize literal — ${line.trim()}`)
        if (ARBITRARY_TEXT_PX_RE.test(line)) hits.push(`L${i + 1}: arbitrary text-[Npx] — ${line.trim()}`)
        if (TEXT_WHITE_RE.test(line)) hits.push(`L${i + 1}: text-white — ${line.trim()}`)
      })
      expect(hits, hits.join('\n')).toEqual([])
    })
  }
})
