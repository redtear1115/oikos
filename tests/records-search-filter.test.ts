import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyFilterToParams,
  defaultFilter,
  filterKey,
  fromWire,
  isFilterActive,
  isFilterNarrowing,
  matchesFilter,
  normalizeSearchText,
  parseFilterFromRecord,
  parseFilterFromSearchParams,
  parseDateRangeFromRecord,
  toWire,
  SEARCH_TEXT_MAX,
  type FilterableRow,
  type TxnFilter,
} from '@/lib/filter'
import { resolveTxnFilter, resolveIncomeFilter } from '@/lib/resolveTxnFilter'

const f = (patch: Partial<TxnFilter> = {}): TxnFilter => ({ ...defaultFilter(), ...patch })

describe('search text: parse / serialize / wire', () => {
  it('parses ?q= trimmed, whitespace-collapsed, capped; empty is absent', () => {
    expect(parseFilterFromSearchParams(new URLSearchParams('search=1&q=%20%20foo%20%20bar%20')).text).toBe('foo bar')
    expect(parseFilterFromSearchParams(new URLSearchParams('search=1&q=%20%20')).text).toBeUndefined()
    expect(parseFilterFromSearchParams(new URLSearchParams('')).text).toBeUndefined()
    const long = parseFilterFromSearchParams(new URLSearchParams({ search: '1', q: 'a'.repeat(300) })).text
    expect(long).toHaveLength(SEARCH_TEXT_MAX)
  })

  it('the record variant (server searchParams) parses it too', () => {
    expect(parseFilterFromRecord({ search: '1', q: ' 咖啡 ' }).text).toBe('咖啡')
    expect(parseFilterFromRecord({}).text).toBeUndefined()
  })

  it('serialize round-trips and removes q when absent', () => {
    const p = new URLSearchParams('search=1')
    applyFilterToParams(p, f({ text: '咖啡 券' }))
    expect(p.get('q')).toBe('咖啡 券')
    expect(parseFilterFromSearchParams(p).text).toBe('咖啡 券')
    applyFilterToParams(p, f())
    expect(p.has('q')).toBe(false)
  })

  it('ignores q without search=1 (both parse variants)', () => {
    expect(parseFilterFromSearchParams(new URLSearchParams('q=foo')).text).toBeUndefined()
    expect(parseFilterFromRecord({ q: 'foo' }).text).toBeUndefined()
    expect(filterKey(parseFilterFromRecord({ q: 'foo' }))).toBe('none')
  })

  it('never splits a surrogate pair at the cap (filterKey must not throw)', () => {
    const t = normalizeSearchText('a'.repeat(99) + '😀')!
    expect(() => filterKey(f({ text: t }))).not.toThrow()
    const t2 = normalizeSearchText('a'.repeat(98) + '😀😀')!
    expect(() => encodeURIComponent(t2)).not.toThrow()
  })

  it('serialize leaves ?search=1 alone (mode is not part of the filter)', () => {
    const p = new URLSearchParams('search=1&q=x')
    applyFilterToParams(p, f({ text: 'y' }))
    expect(p.get('search')).toBe('1')
  })

  it('wire round-trips text, omits it when absent, and re-normalizes on the way in', () => {
    expect(toWire(f({ text: 'foo' })).text).toBe('foo')
    expect('text' in toWire(f())).toBe(false)
    expect(fromWire(toWire(f({ text: 'foo' }))).text).toBe('foo')
    expect(fromWire({ ...toWire(f()), text: '   ' }).text).toBeUndefined()
    expect(fromWire({ ...toWire(f()), text: 'x'.repeat(500) }).text).toHaveLength(SEARCH_TEXT_MAX)
  })

  it('normalizeSearchText handles null / empty', () => {
    expect(normalizeSearchText(null)).toBeUndefined()
    expect(normalizeSearchText('')).toBeUndefined()
  })
})

describe('isFilterActive vs isFilterNarrowing', () => {
  it('text alone does not light the chip but does narrow', () => {
    const only = f({ text: 'foo' })
    expect(isFilterActive(only)).toBe(false)
    expect(isFilterNarrowing(only)).toBe(true)
    expect(isFilterNarrowing(f())).toBe(false)
    expect(isFilterNarrowing(f({ payer: 'mine' }))).toBe(true)
  })

  it('filterKey is not "none" with only text and changes with the text', () => {
    expect(filterKey(f())).toBe('none')
    const a = filterKey(f({ text: 'foo' }))
    const b = filterKey(f({ text: 'bar' }))
    expect(a).not.toBe('none')
    expect(a).not.toBe(b)
    expect(filterKey(f({ text: 'foo' }))).toBe(a)
  })
})

describe('resolvers carry text to both resolved filters', () => {
  const pair = { memberA: 'me', memberB: 'you' }
  it('expense + income', () => {
    expect(resolveTxnFilter(f({ text: 'foo' }), 'me', pair).text).toBe('foo')
    expect(resolveIncomeFilter(f({ text: 'foo' }), 'me', pair).text).toBe('foo')
    expect(resolveTxnFilter(f(), 'me', pair).text).toBeUndefined()
  })
})

describe('default date range with ?search=1', () => {
  it('is the current month, same as without it', () => {
    const a = parseDateRangeFromRecord({}, '2026-10')
    const b = parseDateRangeFromRecord({ search: '1', q: 'foo' } as never, '2026-10')
    expect(b).toEqual(a)
    expect(a).toEqual({ kind: 'month', monthKey: '2026-10' })
  })
})

describe('matchesFilter with text', () => {
  const base: FilterableRow = { paidBy: 'me', splitType: 'half', category: 'dining', kind: 'transaction' }
  const flt = f({ text: 'foo' })
  const m = (row: FilterableRow, filter = flt) => matchesFilter(row, filter, 'me', 'you')

  it('rejects a transaction with no match in description or notes', () => {
    expect(m({ ...base, description: 'lunch', notes: 'bar' })).toBe(false)
    expect(m({ ...base })).toBe(false)
    expect(m({ ...base, description: null, notes: null })).toBe(false)
  })
  it('accepts a case-insensitive substring in description or notes', () => {
    expect(m({ ...base, description: 'lunch', notes: 'with FOO' })).toBe(true)
    expect(m({ ...base, description: 'Foobar', notes: null })).toBe(true)
  })
  it('judges a settlement by its raw note only', () => {
    const s: FilterableRow = { ...base, kind: 'settlement', splitType: null, category: 'settle' }
    expect(m({ ...s, note: 'foo money' })).toBe(true)
    expect(m({ ...s, note: null })).toBe(false)
    // the display fallback text is not a searchable field
    expect(m({ ...s, note: null, description: 'foo' })).toBe(false)
  })
  it('judges income by source', () => {
    expect(m({ ...base, source: 'FOO Inc' })).toBe(true)
    expect(m({ ...base, source: 'bar', description: 'foo' })).toBe(false)
  })
  it('does not treat % or _ specially (substring, like the escaped SQL)', () => {
    expect(m({ ...base, description: '50%_off' }, f({ text: '50%_off' }))).toBe(true)
    expect(m({ ...base, description: '50xxoff' }, f({ text: '50%_off' }))).toBe(false)
  })
  it('without text the new fields are ignored', () => {
    expect(m({ ...base }, f())).toBe(true)
  })
})

describe('loadMoreIncomes uses the shared resolver (C2b)', () => {
  const calls: unknown[][] = []
  beforeEach(() => { calls.length = 0 })

  it('passes text through to listIncomesPaged', async () => {
    vi.resetModules()
    vi.doMock('@/lib/auth/viewer', () => ({ requireViewer: async () => ({ user: { id: 'me' } }) }))
    vi.doMock('@/lib/db/queries/epoch', () => ({
      resolveViewerEpochContext: async () => ({
        group: { id: 'g1', memberA: 'me', memberB: 'you' },
        window: { startedAt: new Date(0), endedAt: null, epochId: 'e', isPast: false },
      }),
      lockOpenChapterForWrite: vi.fn(),
      // #1604 — live chapter: the viewed pair is the group row.
      resolveViewedPair: async (ctx: { group: { memberA: string; memberB: string | null } }) =>
        ({ memberA: ctx.group.memberA, memberB: ctx.group.memberB }),
    }))
    vi.doMock('@/lib/db/queries/incomes', () => ({
      listIncomesPaged: async (...a: unknown[]) => { calls.push(a); return [] },
    }))
    vi.doMock('@/lib/db/client', () => ({ db: {} }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))
    const { loadMoreIncomes } = await import('@/actions/income')
    const wire = toWire(f({ text: 'foo' }))
    const out = await loadMoreIncomes(null, 20, '2026-05', undefined, wire)
    expect(out).toMatchObject({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]![5]).toMatchObject({ text: 'foo', cutAll: false })
  })

  it('no private resolveIncomeFilter copy remains in actions/', () => {
    const src = readFileSync(join(process.cwd(), 'actions/income.ts'), 'utf8')
    expect(src).not.toMatch(/function resolveIncomeFilter/)
  })
})
