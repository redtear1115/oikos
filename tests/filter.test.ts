import { describe, it, expect } from 'vitest'
import {
  applyDateRangeToParams,
  applyFilterToParams,
  ASSET_FILTER_NONE,
  cutsExpense,
  cutsIncome,
  defaultFilter,
  fromWire,
  hidesSettlements,
  isFilterActive,
  matchesFilter,
  parseDateRangeFromRecord,
  parseDateRangeFromSearchParams,
  parseFilterFromRecord,
  parseFilterFromSearchParams,
  resolveDateRangeToDateBounds,
  toWire,
  type DateRange,
  type FilterableRow,
  type TxnFilter,
} from '@/lib/filter'

describe('defaultFilter', () => {
  it('is inactive', () => {
    expect(isFilterActive(defaultFilter())).toBe(false)
  })
  it('does not hide settlements', () => {
    expect(hidesSettlements(defaultFilter())).toBe(false)
  })
})

describe('isFilterActive', () => {
  it('payer alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), payer: 'mine' })).toBe(true)
  })
  it('split alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), split: 'half' })).toBe(true)
  })
  it('categories alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), categories: new Set(['dining']) })).toBe(true)
  })
  it('assetIds alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), assetIds: new Set(['11111111-1111-1111-1111-111111111111']) })).toBe(true)
  })
  it('incomeCategories alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), incomeCategories: new Set(['salary']) })).toBe(true)
  })
})

describe('hidesSettlements', () => {
  it('payer-only does NOT hide settlements (settlements have a payer)', () => {
    expect(hidesSettlements({ ...defaultFilter(), payer: 'mine' })).toBe(false)
  })
  it('split active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), split: 'half' })).toBe(true)
  })
  it('categories active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), categories: new Set(['dining']) })).toBe(true)
  })
  it('assetIds active hides settlements (settlements have no asset_id)', () => {
    expect(hidesSettlements({ ...defaultFilter(), assetIds: new Set([ASSET_FILTER_NONE]) })).toBe(true)
  })
  it('incomeCategories active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), incomeCategories: new Set(['salary']) })).toBe(true)
  })
})

describe('cutsIncome / cutsExpense — cross-kind cut rules', () => {
  it('expense category alone → cuts income', () => {
    const f = { ...defaultFilter(), categories: new Set(['dining'] as const) }
    expect(cutsIncome(f)).toBe(true)
    expect(cutsExpense(f)).toBe(false)
  })
  it('split alone → cuts income', () => {
    const f = { ...defaultFilter(), split: 'half' as const }
    expect(cutsIncome(f)).toBe(true)
    expect(cutsExpense(f)).toBe(false)
  })
  it('income category alone → cuts expense', () => {
    const f = { ...defaultFilter(), incomeCategories: new Set(['salary'] as const) }
    expect(cutsIncome(f)).toBe(false)
    expect(cutsExpense(f)).toBe(true)
  })
  it('expense + income categories together → neither cut (each kind narrows itself)', () => {
    const f = {
      ...defaultFilter(),
      categories: new Set(['dining'] as const),
      incomeCategories: new Set(['salary'] as const),
    }
    expect(cutsIncome(f)).toBe(false)
    expect(cutsExpense(f)).toBe(false)
  })
  it('payer / asset alone → neither cut (orthogonal to kind)', () => {
    const f = {
      ...defaultFilter(),
      payer: 'mine' as const,
      assetIds: new Set(['11111111-1111-1111-1111-111111111111']),
    }
    expect(cutsIncome(f)).toBe(false)
    expect(cutsExpense(f)).toBe(false)
  })
})

describe('wire round-trip', () => {
  it('preserves all dimensions', () => {
    const f: TxnFilter = {
      payer: 'theirs',
      split: 'half',
      categories: new Set(['dining', 'transit']),
      incomeCategories: new Set(['salary', 'bonus']),
      assetIds: new Set(['11111111-1111-1111-1111-111111111111', ASSET_FILTER_NONE]),
    }
    expect(fromWire(toWire(f))).toEqual(f)
  })
  it('reads a wire with no incomeCategories / assetIds (back-compat)', () => {
    const wire = {
      payer: 'mine' as const,
      split: 'all' as const,
      categories: ['dining'],
      incomeCategories: [],
      assetIds: [],
    }
    expect(fromWire(wire)).toEqual({
      payer: 'mine',
      split: 'all',
      categories: new Set(['dining']),
      incomeCategories: new Set(),
      assetIds: new Set(),
    })
  })
})

const txMine: FilterableRow = { paidBy: 'me', splitType: 'half', category: 'dining', kind: 'transaction', assetId: 'a-1' }
const txTheirs: FilterableRow = { paidBy: 'them', splitType: 'all_theirs', category: 'transit', kind: 'transaction', assetId: null }
const settleMine: FilterableRow = { paidBy: 'me', splitType: null, category: 'settle', kind: 'settlement' }
const settleTheirs: FilterableRow = { paidBy: 'them', splitType: null, category: 'settle', kind: 'settlement' }

describe('matchesFilter — payer dimension', () => {
  it('all → all rows pass', () => {
    const f = defaultFilter()
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
  })
  it('mine → only my rows', () => {
    const f = { ...defaultFilter(), payer: 'mine' as const }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleTheirs, f, 'me', 'them')).toBe(false)
  })
  it('theirs with no partner → nothing passes', () => {
    const f = { ...defaultFilter(), payer: 'theirs' as const }
    expect(matchesFilter(txTheirs, f, 'me', null)).toBe(false)
  })
  it('theirs with partner → only partner rows', () => {
    const f = { ...defaultFilter(), payer: 'theirs' as const }
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(false)
  })
})

describe('matchesFilter — split dimension', () => {
  it('all → tx + settle pass', () => {
    const f = defaultFilter()
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
  })
  it('half → only half tx; settle dropped', () => {
    const f = { ...defaultFilter(), split: 'half' as const }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)        // half
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)     // all_theirs
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)   // settlements dropped
  })
})

describe('matchesFilter — category dimension', () => {
  it('food selected → only food tx; settle dropped', () => {
    const f = { ...defaultFilter(), categories: new Set(['dining'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)
  })
  it('multi-category union', () => {
    const f = { ...defaultFilter(), categories: new Set(['dining', 'transit'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
  })
})

describe('matchesFilter — incomeCategories dimension drops cash transactions when income-only', () => {
  it('income category alone → cash tx fails', () => {
    const f = { ...defaultFilter(), incomeCategories: new Set(['salary'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)  // settlements also drop
  })
  it('expense + income categories → cash tx narrows by expense cat (income-only cut does not apply)', () => {
    const f = {
      ...defaultFilter(),
      categories: new Set(['dining'] as const),
      incomeCategories: new Set(['salary'] as const),
    }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)        // dining matches
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)     // transit doesn't
  })
})

describe('matchesFilter — assetIds dimension', () => {
  it('uuid match → only matching-asset tx; settle + other-asset dropped', () => {
    const f = { ...defaultFilter(), assetIds: new Set(['a-1']) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)        // assetId 'a-1'
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)     // assetId null
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)   // settlements have no asset
  })
  it('ASSET_FILTER_NONE matches null-asset rows', () => {
    const f = { ...defaultFilter(), assetIds: new Set([ASSET_FILTER_NONE]) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(false)       // assetId 'a-1' fails
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)      // assetId null passes
  })
  it('combined uuid + sentinel matches both', () => {
    const f = { ...defaultFilter(), assetIds: new Set(['a-1', ASSET_FILTER_NONE]) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
  })
})

// ─── URL serialization ───────────────────────────────────────────────────────

describe('parseFilterFromSearchParams', () => {
  it('returns the default filter for empty params', () => {
    expect(parseFilterFromSearchParams(new URLSearchParams())).toEqual(defaultFilter())
  })

  it('reads payer / split / cats / incCats / assets', () => {
    const p = new URLSearchParams('fPayer=mine&fSplit=half&fCats=dining,transit&fIncCats=salary,bonus&fAssets=11111111-1111-1111-1111-111111111111,__none__')
    const f = parseFilterFromSearchParams(p)
    expect(f.payer).toBe('mine')
    expect(f.split).toBe('half')
    expect(f.categories).toEqual(new Set(['dining', 'transit']))
    expect(f.incomeCategories).toEqual(new Set(['salary', 'bonus']))
    expect(f.assetIds).toEqual(new Set(['11111111-1111-1111-1111-111111111111', ASSET_FILTER_NONE]))
  })

  it('drops unknown payer / split / cats / incCats / assets silently', () => {
    const p = new URLSearchParams('fPayer=bogus&fSplit=nope&fCats=dining,zzz,settle&fIncCats=salary,fakecat&fAssets=not-a-uuid,11111111-1111-1111-1111-111111111111')
    const f = parseFilterFromSearchParams(p)
    expect(f.payer).toBe('all')
    expect(f.split).toBe('all')
    expect(f.categories).toEqual(new Set(['dining']))   // 'zzz' invalid, 'settle' filtered
    expect(f.incomeCategories).toEqual(new Set(['salary']))  // 'fakecat' rejected
    expect(f.assetIds).toEqual(new Set(['11111111-1111-1111-1111-111111111111']))  // 'not-a-uuid' rejected
  })
})

describe('parseFilterFromRecord', () => {
  it('reads from a plain object (server searchParams shape)', () => {
    expect(parseFilterFromRecord({ fPayer: 'theirs', fCats: 'dining' })).toEqual({
      payer: 'theirs',
      split: 'all',
      categories: new Set(['dining']),
      incomeCategories: new Set(),
      assetIds: new Set(),
    })
  })
})

describe('applyFilterToParams', () => {
  it('round-trips through search params', () => {
    const original: TxnFilter = {
      payer: 'mine',
      split: 'all_theirs',
      categories: new Set(['transit', 'dining']),
      incomeCategories: new Set(['bonus', 'salary']),
      assetIds: new Set([ASSET_FILTER_NONE, '11111111-1111-1111-1111-111111111111']),
    }
    const p = new URLSearchParams()
    applyFilterToParams(p, original)
    const reread = parseFilterFromSearchParams(p)
    expect(reread).toEqual(original)
  })

  it('strips params for default values', () => {
    const p = new URLSearchParams('fPayer=mine&fSplit=half&fCats=dining&fIncCats=salary&fAssets=__none__')
    applyFilterToParams(p, defaultFilter())
    expect(p.get('fPayer')).toBeNull()
    expect(p.get('fSplit')).toBeNull()
    expect(p.get('fCats')).toBeNull()
    expect(p.get('fIncCats')).toBeNull()
    expect(p.get('fAssets')).toBeNull()
  })

  it('serializes categories sorted (stable URL)', () => {
    const f = { ...defaultFilter(), categories: new Set(['transit', 'dining'] as const) }
    const p = new URLSearchParams()
    applyFilterToParams(p, f)
    expect(p.get('fCats')).toBe('dining,transit')
  })

  it('serializes incomeCategories sorted (stable URL)', () => {
    const f = { ...defaultFilter(), incomeCategories: new Set(['salary', 'bonus'] as const) }
    const p = new URLSearchParams()
    applyFilterToParams(p, f)
    expect(p.get('fIncCats')).toBe('bonus,salary')
  })
})

// ─── Date range ──────────────────────────────────────────────────────────────

describe('parseDateRangeFromSearchParams', () => {
  it('falls back to default month for empty params', () => {
    const r = parseDateRangeFromSearchParams(new URLSearchParams(), '2026-05')
    expect(r).toEqual({ kind: 'month', monthKey: '2026-05' })
  })

  it('reads ?range=all', () => {
    const r = parseDateRangeFromSearchParams(new URLSearchParams('range=all'), '2026-05')
    expect(r).toEqual({ kind: 'all' })
  })

  it('reads ?from=&to= when both valid', () => {
    const r = parseDateRangeFromSearchParams(
      new URLSearchParams('from=2026-04-01&to=2026-04-30'),
      '2026-05',
    )
    expect(r).toEqual({ kind: 'range', start: '2026-04-01', end: '2026-04-30' })
  })

  it('falls through to month when from > to', () => {
    const r = parseDateRangeFromSearchParams(
      new URLSearchParams('from=2026-04-30&to=2026-04-01&month=2026-03'),
      '2026-05',
    )
    expect(r).toEqual({ kind: 'month', monthKey: '2026-03' })
  })

  it('reads ?month=YYYY-MM', () => {
    const r = parseDateRangeFromSearchParams(new URLSearchParams('month=2026-03'), '2026-05')
    expect(r).toEqual({ kind: 'month', monthKey: '2026-03' })
  })

  it('drops malformed dates and falls back', () => {
    const r = parseDateRangeFromSearchParams(
      new URLSearchParams('from=not-a-date&to=2026-04-30&month=2026-03'),
      '2026-05',
    )
    expect(r).toEqual({ kind: 'month', monthKey: '2026-03' })
  })
})

describe('parseDateRangeFromRecord', () => {
  it('reads from a plain object', () => {
    expect(parseDateRangeFromRecord({ from: '2026-04-01', to: '2026-04-30' }, '2026-05'))
      .toEqual({ kind: 'range', start: '2026-04-01', end: '2026-04-30' })
  })
})

describe('applyDateRangeToParams', () => {
  it('sets ?range=all + clears other date params', () => {
    const p = new URLSearchParams('month=2026-04&from=2026-01-01&to=2026-01-31')
    applyDateRangeToParams(p, { kind: 'all' })
    expect(p.get('range')).toBe('all')
    expect(p.get('month')).toBeNull()
    expect(p.get('from')).toBeNull()
    expect(p.get('to')).toBeNull()
  })

  it('sets from+to + clears others', () => {
    const p = new URLSearchParams('month=2026-04&range=all')
    applyDateRangeToParams(p, { kind: 'range', start: '2026-04-01', end: '2026-04-30' })
    expect(p.get('from')).toBe('2026-04-01')
    expect(p.get('to')).toBe('2026-04-30')
    expect(p.get('month')).toBeNull()
    expect(p.get('range')).toBeNull()
  })

  it('sets month + clears others', () => {
    const p = new URLSearchParams('range=all&from=2026-01-01&to=2026-01-31')
    applyDateRangeToParams(p, { kind: 'month', monthKey: '2026-04' })
    expect(p.get('month')).toBe('2026-04')
    expect(p.get('range')).toBeNull()
    expect(p.get('from')).toBeNull()
    expect(p.get('to')).toBeNull()
  })
})

describe('resolveDateRangeToDateBounds', () => {
  it('returns null for kind=all', () => {
    expect(resolveDateRangeToDateBounds({ kind: 'all' })).toBeNull()
  })

  it('expands month to YYYY-MM-01 → next month YYYY-MM-01', () => {
    const r = resolveDateRangeToDateBounds({ kind: 'month', monthKey: '2026-05' })
    expect(r).toEqual({ startDate: '2026-05-01', endDateExclusive: '2026-06-01' })
  })

  it('handles December → January year rollover', () => {
    const r = resolveDateRangeToDateBounds({ kind: 'month', monthKey: '2026-12' })
    expect(r).toEqual({ startDate: '2026-12-01', endDateExclusive: '2027-01-01' })
  })

  it('expands custom range to inclusive-start, exclusive-next-day-end', () => {
    const r = resolveDateRangeToDateBounds({
      kind: 'range',
      start: '2026-05-15',
      end: '2026-05-20',
    })
    expect(r).toEqual({ startDate: '2026-05-15', endDateExclusive: '2026-05-21' })
  })
})

describe('end-to-end URL round-trip', () => {
  it('full filter + custom date range survives URL serialize → parse', () => {
    const filter: TxnFilter = {
      payer: 'theirs',
      split: 'half',
      categories: new Set(['dining']),
      incomeCategories: new Set(['salary']),
      assetIds: new Set([ASSET_FILTER_NONE, '11111111-1111-1111-1111-111111111111']),
    }
    const range: DateRange = { kind: 'range', start: '2026-04-01', end: '2026-04-30' }
    const p = new URLSearchParams()
    applyFilterToParams(p, filter)
    applyDateRangeToParams(p, range)

    expect(parseFilterFromSearchParams(p)).toEqual(filter)
    expect(parseDateRangeFromSearchParams(p, '2026-05')).toEqual(range)
  })
})
