/**
 * Migrate-side coverage for the unified CSV layer (issue #623). The marketing
 * preview consumes `lib/csvImport`'s primitives directly — these tests pin
 * down the behaviour the anonymous /migrate pages depend on (Big5 decoding,
 * RFC 4180 parsing, the raw header sniffer, and the column-name heuristic
 * stats card).
 */
import { describe, it, expect } from 'vitest'
import {
  computeStats,
  decodeBytes,
  detectCsvSource,
  parseCsvText,
  type CsvRow,
} from '@/lib/csvImport'

const UTF8_BOM = '﻿'
const enc = new TextEncoder()

function toBytes(s: string, bom = false): ArrayBuffer {
  const arr = enc.encode((bom ? UTF8_BOM : '') + s)
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
}

describe('decodeBytes', () => {
  it('decodes plain UTF-8 text', () => {
    const out = decodeBytes(toBytes('date,amount\n2026-01-01,100\n'))
    expect(out.text).toBe('date,amount\n2026-01-01,100\n')
    expect(out.encoding).toBe('utf-8')
  })

  it('strips UTF-8 BOM and reports utf-8-bom', () => {
    const out = decodeBytes(toBytes('date,amount\n', true))
    expect(out.text.startsWith('﻿')).toBe(false)
    expect(out.text).toBe('date,amount\n')
    expect(out.encoding).toBe('utf-8-bom')
  })

  it('decodes Big5-encoded bytes when UTF-8 fails (CJK)', () => {
    // 「日期,金額\n」 in Big5 (manually byte-encoded). 日=A4E9 期=B4C1 金=AAF7 額=C342.
    const big5 = new Uint8Array([
      0xA4, 0xE9, 0xB4, 0xC1, 0x2C, 0xAA, 0xF7, 0xC3, 0x42, 0x0A,
    ])
    const buf = big5.buffer.slice(big5.byteOffset, big5.byteOffset + big5.byteLength) as ArrayBuffer
    const out = decodeBytes(buf)
    expect(out.encoding).toBe('big5')
    expect(out.text).toBe('日期,金額\n')
  })
})

describe('parseCsvText (migrate preview)', () => {
  it('parses headers + rows', () => {
    const out = parseCsvText('date,amount\n2026-01-01,100\n2026-01-02,200\n')
    expect(out.headers).toEqual(['date', 'amount'])
    expect(out.rows).toEqual([
      { date: '2026-01-01', amount: '100' },
      { date: '2026-01-02', amount: '200' },
    ])
  })

  it('handles CRLF line endings', () => {
    const out = parseCsvText('a,b\r\n1,2\r\n')
    expect(out.headers).toEqual(['a', 'b'])
    expect(out.rows).toEqual([{ a: '1', b: '2' }])
  })

  it('handles quoted fields with commas and escaped quotes', () => {
    const out = parseCsvText('a,b\n"hello, world","she said ""hi"""\n')
    expect(out.rows).toEqual([{ a: 'hello, world', b: 'she said "hi"' }])
  })

  it('handles quoted fields with embedded newlines', () => {
    const out = parseCsvText('a,b\n"line1\nline2",2\n')
    expect(out.rows).toEqual([{ a: 'line1\nline2', b: '2' }])
  })

  it('skips trailing blank lines', () => {
    const out = parseCsvText('a,b\n1,2\n\n\n')
    expect(out.rows).toHaveLength(1)
  })

  it('pads short rows with empty strings', () => {
    const out = parseCsvText('a,b,c\n1,2\n')
    expect(out.rows).toEqual([{ a: '1', b: '2', c: '' }])
  })
})

describe('detectCsvSource', () => {
  it('detects Honeydue by typical header signature', () => {
    expect(detectCsvSource(['Date', 'Name', 'Category', 'Amount', 'Account'])).toBe('honeydue')
  })

  it('detects Spendee by typical header signature', () => {
    expect(detectCsvSource(['Date', 'Wallet', 'Type', 'Category name', 'Amount', 'Currency', 'Note'])).toBe('spendee')
  })

  it('detects CWMoney by Chinese column headers', () => {
    expect(detectCsvSource(['日期', '類別', '項目', '金額', '帳戶'])).toBe('cwmoney')
  })

  it('returns null for unfamiliar headers (callers map to their own fallback)', () => {
    expect(detectCsvSource(['foo', 'bar'])).toBeNull()
  })

  it('is case-insensitive on English headers', () => {
    expect(detectCsvSource(['date', 'name', 'category', 'amount', 'account'])).toBe('honeydue')
  })
})

describe('computeStats', () => {
  const rows: CsvRow[] = [
    { Date: '2026-01-05', Amount: '-100', Category: 'Food' },
    { Date: '2026-01-10', Amount: '-50', Category: 'Food' },
    { Date: '2026-01-15', Amount: '-200', Category: 'Transport' },
    { Date: '2026-01-20', Amount: '500', Category: 'Salary' }, // income
    { Date: '2026-02-01', Amount: '-30', Category: 'Coffee' },
  ]

  it('counts total rows', () => {
    expect(computeStats(rows).totalRows).toBe(5)
  })

  it('counts expense rows (negative amounts)', () => {
    expect(computeStats(rows).estimatedExpenseRows).toBe(4)
  })

  it('computes date range across rows', () => {
    expect(computeStats(rows).dateRange).toEqual({ first: '2026-01-05', last: '2026-02-01' })
  })

  it('returns top categories by frequency, capped at 5', () => {
    const out = computeStats(rows)
    expect(out.topCategories[0]).toEqual({ name: 'Food', count: 2 })
    expect(out.topCategories.length).toBeLessThanOrEqual(5)
  })

  it('handles missing date / amount columns gracefully', () => {
    const out = computeStats([{ foo: 'bar' }])
    expect(out.totalRows).toBe(1)
    expect(out.estimatedExpenseRows).toBe(0)
    expect(out.dateRange).toBeNull()
    expect(out.topCategories).toEqual([])
  })

  it('detects amount column by alternate names (金額, Amount, amount)', () => {
    const cwRows: CsvRow[] = [{ 日期: '2026-01-01', 金額: '-100', 類別: '吃飯' }]
    const out = computeStats(cwRows)
    expect(out.estimatedExpenseRows).toBe(1)
    expect(out.dateRange).toEqual({ first: '2026-01-01', last: '2026-01-01' })
    expect(out.topCategories).toEqual([{ name: '吃飯', count: 1 }])
  })
})
