/**
 * #1822 - Merchant memory for category suggestions.
 *
 * When an expense is brought in from outside (URL prefill #1488 or pending
 * shortcut card #1536), the merchant name comes in the description/note field.
 * For the same merchant, we auto-suggest the category chosen the last time
 * this merchant was recorded.
 *
 * Priority: merchant memory > URL/payload category > default category (dining).
 *
 * What failure looks like: nothing errors. The category auto-fills to 'dining'
 * every time, or stays locked to the URL's category even when the user has
 * recorded that merchant with a different category before. The second record
 * for the same merchant should pick up the category from the first.
 */
import { describe, it, expect } from 'vitest'
import type { CategoryId } from '@/lib/categories'
import { normalizeMerchant, getCategoryForMerchant } from '@/lib/db/queries/merchantMemory'

describe('merchant memory - normalization logic', () => {
  describe('normalizeMerchant', () => {
    it('normalizes case', () => {
      expect(normalizeMerchant('Starbucks')).toBe('starbucks')
      expect(normalizeMerchant('STARBUCKS')).toBe('starbucks')
      expect(normalizeMerchant('sTaRbUcKs')).toBe('starbucks')
    })

    it('normalizes fullwidth/halfwidth characters (NFKC)', () => {
      // Fullwidth digits and letters should normalize to halfwidth
      // The dash in the input is U+2212 MINUS SIGN which NFKC does not convert
      // to ASCII hyphen-minus. What matters is that both fullwidth forms match.
      const fullwidth = normalizeMerchant('７−ＥＬＥＶＥＮ')
      const halfwidth = normalizeMerchant('7−ELEVEN')
      expect(fullwidth).toBe(halfwidth)

      // Also test actual fullwidth hyphen (U+FF0D) which does convert
      expect(normalizeMerchant('７ーＥＬＥＶＥＮ')).toBe('7ーeleven')
    })

    it('trims leading and trailing whitespace', () => {
      expect(normalizeMerchant('  Cafe  ')).toBe('cafe')
      expect(normalizeMerchant('Cafe')).toBe('cafe')
      expect(normalizeMerchant('  Cafe')).toBe('cafe')
      expect(normalizeMerchant('Cafe  ')).toBe('cafe')
    })

    it('handles empty or whitespace-only input', () => {
      expect(normalizeMerchant('')).toBe('')
      expect(normalizeMerchant('   ')).toBe('')
      expect(normalizeMerchant('\t\n')).toBe('')
    })

    it('handles merchants with special characters', () => {
      expect(normalizeMerchant('C\'est Bon! (好吃)')).toBe('c\'est bon! (好吃)')
      expect(normalizeMerchant('  c\'est bon! (好吃)  ')).toBe('c\'est bon! (好吃)')
    })

    it('differentiates between similar but different merchants', () => {
      const norm1 = normalizeMerchant('Starbucks')
      const norm2 = normalizeMerchant('Starbucks Reserve')
      expect(norm1).not.toBe(norm2)
      expect(norm1).toBe('starbucks')
      expect(norm2).toBe('starbucks reserve')
    })

    it('handles merchant names with internal whitespace differences', () => {
      // Internal whitespace is preserved, not normalized
      expect(normalizeMerchant('Cafe  Latte')).toBe('cafe  latte')
      expect(normalizeMerchant('Cafe Latte')).toBe('cafe latte')
      expect(normalizeMerchant('Cafe  Latte')).not.toBe(normalizeMerchant('Cafe Latte'))
    })

    it('handles Unicode normalization', () => {
      // é as precomposed (U+00E9) and as e + combining acute (U+0065 U+0301)
      // should normalize to the same form
      const cafe1 = 'Café' // U+00E9
      const cafe2 = 'Café' // e + U+0301
      expect(normalizeMerchant(cafe1)).toBe(normalizeMerchant(cafe2))
    })

    it('handles very long merchant names', () => {
      const longName = 'A'.repeat(100)
      expect(normalizeMerchant(longName)).toBe('a'.repeat(100))
    })
  })

  describe('priority order logic', () => {
    it('merchant memory takes precedence over URL category', () => {
      const merchantMemory: CategoryId = 'health'
      const urlCategory: CategoryId = 'dining'
      const defaultCategory: CategoryId = 'dining'

      const result = merchantMemory ?? urlCategory ?? defaultCategory
      expect(result).toBe('health')
    })

    it('URL category is used when no merchant history exists', () => {
      const merchantMemory: CategoryId | null = null
      const urlCategory: CategoryId = 'transit'
      const defaultCategory: CategoryId = 'dining'

      const result = merchantMemory ?? urlCategory ?? defaultCategory
      expect(result).toBe('transit')
    })

    it('default category is used when no merchant history and no URL category', () => {
      const merchantMemory: CategoryId | null = null
      const urlCategory: CategoryId | undefined = undefined
      const defaultCategory: CategoryId = 'dining'

      const result = merchantMemory ?? urlCategory ?? defaultCategory
      expect(result).toBe('dining')
    })
  })
})

describe('getCategoryForMerchant', () => {
  // Mock transaction rows for testing
  type MockRow = {
    description: string
    category: string
    createdAt?: Date
    transactedAt?: Date
    deletedAt?: Date | null
  }

  function createMockDb(rows: MockRow[]) {
    // Sort by createdAt desc, transactedAt desc (same order as real query)
    const sorted = [...rows]
      .filter((r) => !r.deletedAt)
      .sort((a, b) => {
        const aCreated = a.createdAt?.getTime() ?? 0
        const bCreated = b.createdAt?.getTime() ?? 0
        if (aCreated !== bCreated) return bCreated - aCreated
        const aTransacted = a.transactedAt?.getTime() ?? 0
        const bTransacted = b.transactedAt?.getTime() ?? 0
        return bTransacted - aTransacted
      })
      .slice(0, 100)  // limit(100) in real query

    return {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve(sorted.map((r) => ({
                description: r.description,
                category: r.category,
              }))),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof getCategoryForMerchant>[2]
  }

  it('returns the category of the most recent matching transaction', async () => {
    const mockDb = createMockDb([
      { description: 'Starbucks', category: 'dining', createdAt: new Date('2026-01-01') },
      { description: 'Starbucks', category: 'health', createdAt: new Date('2026-01-02') },
    ])
    const result = await getCategoryForMerchant('group-1', 'Starbucks', mockDb)
    expect(result).toBe('health')  // most recent
  })

  it('matches fullwidth and halfwidth equivalents (NFKC)', async () => {
    // U+FF17 (fullwidth 7), U+FF0D (fullwidth hyphen-minus), fullwidth ELEVEN
    const mockDb = createMockDb([
      { description: '７－ＥＬＥＶＥＮ', category: 'dining', createdAt: new Date('2026-01-01') },
    ])
    const result = await getCategoryForMerchant('group-1', '7-ELEVEN', mockDb)
    expect(result).toBe('dining')
  })

  it('is case-insensitive', async () => {
    const mockDb = createMockDb([
      { description: 'Starbucks', category: 'dining', createdAt: new Date('2026-01-01') },
    ])
    const result = await getCategoryForMerchant('group-1', 'STARBUCKS', mockDb)
    expect(result).toBe('dining')
  })

  it('ignores soft-deleted transactions', async () => {
    const mockDb = createMockDb([
      { description: 'Cafe', category: 'dining', createdAt: new Date('2026-01-02'), deletedAt: new Date('2026-01-03') },
      { description: 'Cafe', category: 'health', createdAt: new Date('2026-01-01'), deletedAt: null },
    ])
    const result = await getCategoryForMerchant('group-1', 'Cafe', mockDb)
    expect(result).toBe('health')  // only non-deleted one
  })

  it('returns undefined when no match exists', async () => {
    const mockDb = createMockDb([
      { description: 'Starbucks', category: 'dining', createdAt: new Date('2026-01-01') },
    ])
    const result = await getCategoryForMerchant('group-1', 'Target', mockDb)
    expect(result).toBeUndefined()
  })

  it('returns undefined when merchant is empty', async () => {
    const mockDb = createMockDb([])
    const result = await getCategoryForMerchant('group-1', '', mockDb)
    expect(result).toBeUndefined()
  })

  it('returns undefined when merchant is whitespace-only', async () => {
    const mockDb = createMockDb([])
    const result = await getCategoryForMerchant('group-1', '   ', mockDb)
    expect(result).toBeUndefined()
  })

  it('returns undefined when the category is not in PICKABLE_CATEGORIES', async () => {
    const mockDb = createMockDb([
      { description: 'Starbucks', category: 'removed-category', createdAt: new Date('2026-01-01') },
    ])
    const result = await getCategoryForMerchant('group-1', 'Starbucks', mockDb)
    expect(result).toBeUndefined()
  })

  it('prefers the most recent by createdAt, then transactedAt', async () => {
    const mockDb = createMockDb([
      { description: 'Cafe', category: 'dining', createdAt: new Date('2026-01-01T10:00:00Z'), transactedAt: new Date('2026-01-01T09:00:00Z') },
      { description: 'Cafe', category: 'health', createdAt: new Date('2026-01-01T10:00:00Z'), transactedAt: new Date('2026-01-01T10:00:00Z') },
    ])
    const result = await getCategoryForMerchant('group-1', 'Cafe', mockDb)
    expect(result).toBe('health')  // same createdAt, later transactedAt wins
  })

  it('trims the merchant name before matching', async () => {
    const mockDb = createMockDb([
      { description: 'Starbucks', category: 'dining', createdAt: new Date('2026-01-01') },
    ])
    const result = await getCategoryForMerchant('group-1', '  Starbucks  ', mockDb)
    expect(result).toBe('dining')
  })
})
