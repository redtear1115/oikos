import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CATEGORIES, getCategory, isValidCategoryId } from '@/lib/categories'
import {
  INCOME_CATEGORIES,
  getIncomeCategory,
  isValidIncomeCategoryId,
} from '@/lib/incomeCategories'

// #1534 — the lookup tables are plain objects, so `id in BY_ID` and
// `BY_ID[id]` also see Object.prototype. A category of 'constructor' passed
// validation, was stored, and rendered as a blank chip (getCategory returned
// the Object function, which has no label / mono / color). Failure looks like:
// no error anywhere, just an empty label on that one record.
const INHERITED = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']

describe('expense categories reject inherited keys', () => {
  it.each(INHERITED)('isValidCategoryId(%s) is false', (id) => {
    expect(isValidCategoryId(id)).toBe(false)
  })

  it.each(INHERITED)('getCategory(%s) falls back to other', (id) => {
    const c = getCategory(id)
    expect(c.id).toBe('other')
    expect(typeof c.label).toBe('string')
  })

  it('every real expense category is still valid and resolves to itself', () => {
    expect(CATEGORIES).toHaveLength(10)
    for (const c of CATEGORIES) {
      expect(isValidCategoryId(c.id)).toBe(true)
      expect(getCategory(c.id)).toBe(c)
    }
  })
})

describe('income categories reject inherited keys', () => {
  it.each(INHERITED)('isValidIncomeCategoryId(%s) is false', (id) => {
    expect(isValidIncomeCategoryId(id)).toBe(false)
  })

  it.each(INHERITED)('getIncomeCategory(%s) falls back to other', (id) => {
    const c = getIncomeCategory(id)
    expect(c.id).toBe('other')
    expect(typeof c.label).toBe('string')
  })

  it('every real income category is still valid and resolves to itself', () => {
    expect(INCOME_CATEGORIES).toHaveLength(10)
    for (const c of INCOME_CATEGORIES) {
      expect(isValidIncomeCategoryId(c.id)).toBe(true)
      expect(getIncomeCategory(c.id)).toBe(c)
    }
  })
})

describe('no `in BY_ID` membership checks under lib/', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx?$/.test(name)) out.push(p)
    }
    return out
  }

  it('uses Object.hasOwn instead (the `in` operator also matches Object.prototype)', () => {
    const root = join(__dirname, '..')
    const hits = walk(join(root, 'lib'))
      .filter((p) => /\bin\s+BY_ID\b/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(root, p))
    expect(hits).toEqual([])
  })
})
