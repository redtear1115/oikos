import { describe, it, expect } from 'vitest'
import { parseQif } from '@/lib/csvImport/qifParser'
import { processBuffer } from '@/lib/csvImport'

const enc = new TextEncoder()
function bytes(s: string): ArrayBuffer {
  const a = enc.encode(s)
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}

// Standard Quicken bank export, US M/D/YYYY dates
const BANK_FIXTURE = `!Type:Bank
D01/15/2026
T-500.00
PConvenience Store
MCoffee + snacks
LFood:Dining
^
D01/20/2026
T4000.00
PAcme Corp
MJanuary salary
LIncome:Salary
^
D02/01/2026
T-1200
M房租
L居住
^
`

// Apostrophe shorthand + 2-digit years + ISO
const DATE_VARIANTS_FIXTURE = `!Type:CCard
D1/5'26
T-50.00
MApostrophe form
^
D1/15/26
T-75.00
M2-digit US year
^
D2026-01-20
T-100.00
MISO date
^
`

// Transfer notation L[Account] should not pollute the synonym table
const TRANSFER_FIXTURE = `!Type:Bank
D03/10/2026
T-2000
PTransfer to Savings
L[Savings]
^
`

describe('parseQif — bank format', () => {
  it('parses each record delimited by ^', () => {
    const rows = parseQif(BANK_FIXTURE)
    expect(rows).toHaveLength(3)
  })

  it('reads US M/D/YYYY dates', () => {
    const rows = parseQif(BANK_FIXTURE)
    expect(rows[0]!.date?.getFullYear()).toBe(2026)
    expect(rows[0]!.date?.getMonth()).toBe(0)
    expect(rows[0]!.date?.getDate()).toBe(15)
  })

  it('flips negative T to expense + positive amount', () => {
    const rows = parseQif(BANK_FIXTURE)
    expect(rows[0]!.type).toBe('expense')
    expect(rows[0]!.amount).toBe(500)
  })

  it('treats positive T as income', () => {
    const rows = parseQif(BANK_FIXTURE)
    expect(rows[1]!.type).toBe('income')
    expect(rows[1]!.amount).toBe(4000)
  })

  it('prefers M (memo) over P (payee) for description', () => {
    const rows = parseQif(BANK_FIXTURE)
    expect(rows[0]!.description).toBe('Coffee + snacks')
    expect(rows[1]!.description).toBe('January salary')
  })

  it('maps L (category) through the Futari synonym table', () => {
    const rows = parseQif(BANK_FIXTURE)
    // Food:Dining → 'food:dining' doesn't match a synonym; falls back to other.
    // The free-text "居住" matches the 中文 synonym → housing.
    expect(rows[2]!.category).toBe('housing')
  })

  it('always sets paidBy=viewer and splitType=half', () => {
    const rows = parseQif(BANK_FIXTURE)
    for (const r of rows) {
      expect(r.paidBy).toBe('viewer')
      expect(r.splitType).toBe('half')
    }
  })
})

describe('parseQif — date dialects', () => {
  it('handles apostrophe shorthand (1/5\'26 → 2026)', () => {
    const rows = parseQif(DATE_VARIANTS_FIXTURE)
    expect(rows[0]!.date?.getFullYear()).toBe(2026)
    expect(rows[0]!.date?.getMonth()).toBe(0)
    expect(rows[0]!.date?.getDate()).toBe(5)
  })

  it('pivots 2-digit US year on 50 (yy<50 → 20yy)', () => {
    const rows = parseQif(DATE_VARIANTS_FIXTURE)
    expect(rows[1]!.date?.getFullYear()).toBe(2026)
  })

  it('accepts ISO YYYY-MM-DD', () => {
    const rows = parseQif(DATE_VARIANTS_FIXTURE)
    expect(rows[2]!.date?.getFullYear()).toBe(2026)
    expect(rows[2]!.date?.getMonth()).toBe(0)
    expect(rows[2]!.date?.getDate()).toBe(20)
  })
})

describe('parseQif — edge cases', () => {
  it('returns an empty array when nothing parseable', () => {
    expect(parseQif('!Type:Bank\n')).toEqual([])
  })

  it('ignores transfer-bracket category notation (L[Account])', () => {
    const rows = parseQif(TRANSFER_FIXTURE)
    expect(rows[0]!.category).toBe('other')
  })

  it('falls back to payee when memo is absent', () => {
    const fixture = `!Type:Bank
D01/15/2026
T-50
PStarbucks
^
`
    const rows = parseQif(fixture)
    expect(rows[0]!.description).toBe('Starbucks')
  })

  it('captures the trailing record when ^ is missing', () => {
    const fixture = `!Type:Bank
D01/15/2026
T-50
MNo terminator
`
    const rows = parseQif(fixture)
    expect(rows).toHaveLength(1)
  })

  it('skips records missing date or amount', () => {
    const fixture = `!Type:Bank
MOrphan memo
^
D01/15/2026
^
T-50
^
`
    expect(parseQif(fixture)).toEqual([])
  })

  it('skips records with unparseable amount', () => {
    const fixture = `!Type:Bank
D01/15/2026
Tabc
^
`
    expect(parseQif(fixture)).toEqual([])
  })

  it('skips records with zero amount', () => {
    const fixture = `!Type:Bank
D01/15/2026
T0
^
`
    expect(parseQif(fixture)).toEqual([])
  })

  it('strips thousands separators in amount', () => {
    const fixture = `!Type:Bank
D01/15/2026
T-1,250.00
MComma sep
^
`
    expect(parseQif(fixture)[0]!.amount).toBe(1250)
  })
})

describe('processBuffer integration — QIF', () => {
  it('auto-detects QIF and validates rows', () => {
    const out = processBuffer(bytes(BANK_FIXTURE))
    expect(out.source).toBe('qif')
    expect(out.stats.total).toBe(3)
    expect(out.stats.valid).toBe(3)
    expect(out.rows[0]!.type).toBe('expense')
    expect(out.rows[1]!.type).toBe('income')
  })

  it('respects explicit source=qif override', () => {
    const out = processBuffer(bytes(BANK_FIXTURE), { source: 'qif' })
    expect(out.source).toBe('qif')
    expect(out.rows).toHaveLength(3)
  })
})
