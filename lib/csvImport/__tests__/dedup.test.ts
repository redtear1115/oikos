import { describe, it, expect } from 'vitest'
import { computeHash, deduplicateRows } from '@/lib/csvImport/dedup'
import type { ImportRow } from '@/lib/csvImport/types'

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    date: new Date('2026-05-09T00:00:00.000Z'),
    amount: 250,
    type: 'expense',
    category: 'dining',
    description: 'lunch',
    paidBy: 'viewer',
    splitType: 'half',
    ...overrides,
  }
}

describe('computeHash', () => {
  it('is deterministic for the same row', () => {
    expect(computeHash(row())).toBe(computeHash(row()))
  })

  it('produces a 64-char hex sha256 digest', () => {
    expect(computeHash(row())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when the date changes (different YYYY-MM-DD)', () => {
    const a = computeHash(row())
    const b = computeHash(row({ date: new Date('2026-05-10T00:00:00.000Z') }))
    expect(a).not.toBe(b)
  })

  it('is stable across times of day on the same UTC date', () => {
    const a = computeHash(row({ date: new Date('2026-05-09T00:00:00.000Z') }))
    const b = computeHash(row({ date: new Date('2026-05-09T23:59:59.000Z') }))
    expect(a).toBe(b)
  })

  it('changes when the amount changes', () => {
    expect(computeHash(row())).not.toBe(computeHash(row({ amount: 251 })))
  })

  it('changes when paidBy flips', () => {
    expect(computeHash(row({ paidBy: 'viewer' })))
      .not.toBe(computeHash(row({ paidBy: 'partner' })))
  })

  it('changes when the category changes', () => {
    expect(computeHash(row({ category: 'dining' })))
      .not.toBe(computeHash(row({ category: 'transport' })))
  })

  it('changes when the first 10 chars of description differ', () => {
    expect(computeHash(row({ description: 'lunch w/ A' })))
      .not.toBe(computeHash(row({ description: 'lunch w/ B' })))
  })

  it('ignores description characters beyond index 10', () => {
    // first 10 chars are identical → hash should match
    const a = computeHash(row({ description: '0123456789-tail-A' }))
    const b = computeHash(row({ description: '0123456789-tail-B' }))
    expect(a).toBe(b)
  })

  it('handles empty description', () => {
    expect(computeHash(row({ description: '' }))).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('deduplicateRows', () => {
  it('marks every row as `new` when the existing set is empty', () => {
    const rows = [
      row({ amount: 100 }),
      row({ amount: 200 }),
      row({ amount: 300 }),
    ]
    const out = deduplicateRows(rows, new Set())
    expect(out.map(r => r.status)).toEqual(['new', 'new', 'new'])
  })

  it('marks `duplicate_db` when the hash is already in the existing set', () => {
    const r = row()
    const existing = new Set([computeHash(r)])
    const [first] = deduplicateRows([r], existing)
    expect(first!.status).toBe('duplicate_db')
  })

  it('marks `duplicate_batch` for the second of two identical rows within a batch', () => {
    const out = deduplicateRows([row(), row()], new Set())
    expect(out[0]!.status).toBe('new')
    expect(out[1]!.status).toBe('duplicate_batch')
  })

  it('DB duplicates take precedence over batch duplicates', () => {
    // Even though the row repeats inside the batch, both should be flagged
    // as `duplicate_db` because the hash already exists in history.
    const r = row()
    const existing = new Set([computeHash(r)])
    const out = deduplicateRows([r, r], existing)
    expect(out[0]!.status).toBe('duplicate_db')
    expect(out[1]!.status).toBe('duplicate_db')
  })

  it('returns hashes parallel-indexed to the input rows', () => {
    const rows = [
      row({ amount: 100 }),
      row({ amount: 200 }),
    ]
    const out = deduplicateRows(rows, new Set())
    expect(out[0]!.hash).toBe(computeHash(rows[0]!))
    expect(out[1]!.hash).toBe(computeHash(rows[1]!))
  })

  it('mixes new / duplicate_db / duplicate_batch in one pass', () => {
    const a = row({ amount: 100 })          // new
    const b = row({ amount: 200 })          // duplicate_db
    const c = row({ amount: 100 })          // duplicate_batch (same as a)
    const d = row({ amount: 300 })          // new
    const existing = new Set([computeHash(b)])
    const out = deduplicateRows([a, b, c, d], existing)
    expect(out.map(r => r.status)).toEqual([
      'new',
      'duplicate_db',
      'duplicate_batch',
      'new',
    ])
  })

  it('treats rows differing only past description[10] as the same batch row', () => {
    // Hash key only sees the first 10 chars; trailing differences collapse.
    const a = row({ description: '0123456789-A' })
    const b = row({ description: '0123456789-B' })
    const out = deduplicateRows([a, b], new Set())
    expect(out[0]!.status).toBe('new')
    expect(out[1]!.status).toBe('duplicate_batch')
  })

  it('preserves row order and identity in the result', () => {
    const rows = [row({ amount: 1 }), row({ amount: 2 })]
    const out = deduplicateRows(rows, new Set())
    expect(out[0]!.row).toBe(rows[0])
    expect(out[1]!.row).toBe(rows[1])
  })
})
