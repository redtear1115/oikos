import { describe, it, expect } from 'vitest'
import {
  buildExportFilename,
  buildTransactionsCsv,
  type ExportLabels,
  type ExportTxnRow,
} from '@/lib/csv/transactions'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { en } from '@/lib/i18n/locales/en'

const ZH_LABELS: ExportLabels = {
  columns: zhTW.csvExport.columns,
  category: zhTW.category,
  splitType: zhTW.splitType,
}

const EN_LABELS: ExportLabels = {
  columns: en.csvExport.columns,
  category: en.category,
  splitType: en.splitType,
}

const BOM = '﻿'

// 2026-05-09 00:00 UTC = 2026-05-09 08:00 Asia/Taipei → '2026-05-09'
const SAMPLE = new Date('2026-05-09T00:00:00.000Z')
// 2026-05-09 23:00 UTC = 2026-05-10 07:00 Asia/Taipei → '2026-05-10' (proves TZ logic)
const SAMPLE_LATE_UTC = new Date('2026-05-09T23:00:00.000Z')

describe('buildTransactionsCsv', () => {
  it('starts with UTF-8 BOM so Excel detects encoding', () => {
    const out = buildTransactionsCsv([], ZH_LABELS)
    expect(out.startsWith(BOM)).toBe(true)
  })

  it('emits header row even when there are no transactions', () => {
    const out = buildTransactionsCsv([], ZH_LABELS).slice(BOM.length)
    const c = zhTW.csvExport.columns
    const q = (v: string) => `"${v}"`
    expect(out).toBe(`${[c.date, c.description, c.amount, c.category, c.paidBy, c.splitType, c.notes].map(q).join(',')}\r\n`)
  })

  it('uses CRLF line endings', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE,
      description: 'coffee',
      amount: 120,
      category: 'dining',
      splitType: 'half',
      paidByName: 'Ray',
      notes: null,
    }]
    const out = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length)
    const lines = out.split('\r\n')
    // header + body + trailing empty (from final CRLF)
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('')
  })

  it('formats date as YYYY-MM-DD in Asia/Taipei (not UTC)', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE_LATE_UTC,
      description: 'late',
      amount: 1,
      category: 'other',
      splitType: 'all_mine',
      paidByName: 'X',
      notes: null,
    }]
    const out = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length)
    const dataLine = out.split('\r\n')[1]
    expect(dataLine.startsWith('2026-05-10,')).toBe(true)
  })

  it('translates category and splitType via labels', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE,
      description: 'lunch',
      amount: 250,
      category: 'dining',
      splitType: 'all_theirs',
      paidByName: 'Ray',
      notes: null,
    }]
    const zhLine = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length).split('\r\n')[1]
    expect(zhLine).toBe(`2026-05-09,"lunch",250,"${zhTW.category.dining}","Ray","${zhTW.splitType.allPartners}",""`)

    const enLine = buildTransactionsCsv(rows, EN_LABELS).slice(BOM.length).split('\r\n')[1]
    // EN allPartners contains an apostrophe; CSV does not need escaping (quotes only).
    expect(enLine).toBe(`2026-05-09,"lunch",250,"${en.category.dining}","Ray","${en.splitType.allPartners}",""`)
  })

  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE,
      description: 'bread, butter',
      amount: 80,
      category: 'dining',
      splitType: 'half',
      paidByName: 'Pat',
      notes: 'said "thanks"\nand smiled',
    }]
    const out = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length)
    const dataLine = out.split('\r\n').slice(1).join('\r\n').replace(/\r\n$/, '')
    // Text cells are always quoted; inner quotes doubled; embedded newline kept inside the quotes.
    expect(dataLine).toBe(
      `2026-05-09,"bread, butter",80,"${zhTW.category.dining}","Pat","${zhTW.splitType.even}","said ""thanks""\nand smiled"`,
    )
  })

  it('renders null notes as empty (not "null" string)', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE,
      description: 'x',
      amount: 1,
      category: 'other',
      splitType: 'half',
      paidByName: 'A',
      notes: null,
    }]
    const out = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length)
    expect(out.split('\r\n')[1].endsWith(',""')).toBe(true)
  })

  it('passes through unknown category id (defensive)', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE,
      description: 'x',
      amount: 1,
      category: 'legacy_unknown',
      splitType: 'half',
      paidByName: 'A',
      notes: null,
    }]
    const out = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length)
    expect(out.split('\r\n')[1].split(',')[3]).toBe('"legacy_unknown"')
  })

  it('preserves order of rows as supplied (caller controls sort)', () => {
    const rows: ExportTxnRow[] = [
      { transactedAt: new Date('2026-01-01T00:00:00Z'), description: 'a', amount: 1, category: 'other', splitType: 'half', paidByName: 'A', notes: null },
      { transactedAt: new Date('2026-02-01T00:00:00Z'), description: 'b', amount: 2, category: 'other', splitType: 'half', paidByName: 'B', notes: null },
    ]
    const lines = buildTransactionsCsv(rows, ZH_LABELS).slice(BOM.length).split('\r\n')
    expect(lines[1].startsWith('2026-01-01,"a",')).toBe(true)
    expect(lines[2].startsWith('2026-02-01,"b",')).toBe(true)
  })

  it('does not include a UUID column (only display name shown)', () => {
    const rows: ExportTxnRow[] = [{
      transactedAt: SAMPLE,
      description: 'x',
      amount: 1,
      category: 'other',
      splitType: 'half',
      paidByName: 'Ray',
      notes: null,
    }]
    const out = buildTransactionsCsv(rows, ZH_LABELS)
    // No 36-char UUID-shaped substring should leak.
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})

describe('buildTransactionsCsv — spreadsheet-safe text cells', () => {
  const row = (over: Partial<ExportTxnRow>): ExportTxnRow => ({
    transactedAt: SAMPLE,
    description: 'x',
    amount: 1,
    category: 'other',
    splitType: 'half',
    paidByName: 'A',
    notes: null,
    ...over,
  })

  // Parse one data line back into cells (RFC 4180, quoted cells only contain
  // doubled quotes / commas / newlines — enough for these fixtures).
  function cells(csv: string): string[] {
    const body = csv.slice(BOM.length).split('\r\n').slice(1).join('\r\n').replace(/\r\n$/, '')
    const out: string[] = []
    let i = 0
    while (i <= body.length) {
      if (body[i] === '"') {
        let v = ''
        i++
        while (i < body.length) {
          if (body[i] === '"' && body[i + 1] === '"') { v += '"'; i += 2 }
          else if (body[i] === '"') { i++; break }
          else { v += body[i]; i++ }
        }
        out.push(v)
        i++ // skip comma
      } else {
        const next = body.indexOf(',', i)
        const end = next === -1 ? body.length : next
        out.push(body.slice(i, end))
        i = end + 1
      }
    }
    return out
  }

  const leading = ['=', '+', '-', '@', '\uFF1D', '\uFF0B', '\uFF0D', '\uFF20']
  const prefixes = ['', ' ', '  ', '\t', '\n', '\r\n', '\u00A0', '\u3000', '\u200B', '\uFEFF', ' \u00A0\n ']

  for (const ch of leading) {
    for (const pre of prefixes) {
      const value = `${pre}${ch}SUM(1,2)`
      it(`prefixes ' to ${JSON.stringify(value)} in every text column`, () => {
        const csv = buildTransactionsCsv([row({
          description: value,
          notes: value,
          paidByName: value,
          category: value, // unknown ids pass through, so the label cell is user-shaped too
        })], EN_LABELS)
        const [, description, , category, paidBy, , notes] = cells(csv)
        for (const cell of [description, category, paidBy, notes]) {
          expect(cell).toBe(`'${value}`)
        }
      })
    }
  }

  it('prefixes a cell that starts with a tab or CR even without a formula character', () => {
    const csv = buildTransactionsCsv([row({ description: '\tplain', notes: '\rplain' })], EN_LABELS)
    const c = cells(csv)
    expect(c[1]).toBe("'\tplain")
    expect(c[6]).toBe("'\rplain")
  })

  it('always quotes text cells, including plain ones', () => {
    const csv = buildTransactionsCsv([row({ description: 'coffee', notes: 'ok' })], EN_LABELS)
    const line = csv.slice(BOM.length).split('\r\n')[1]
    expect(line).toBe(`2026-05-09,"coffee",1,"${en.category.other}","A","${en.splitType.even}","ok"`)
  })

  it('leaves ordinary text alone (no prefix) — including a minus in the middle', () => {
    const csv = buildTransactionsCsv([row({ description: 'A-B trip', notes: 'x = y' })], EN_LABELS)
    const c = cells(csv)
    expect(c[1]).toBe('A-B trip')
    expect(c[6]).toBe('x = y')
  })

  it('keeps date and amount as plain values so they still open as a date and a number', () => {
    const csv = buildTransactionsCsv([row({ amount: 1234 })], EN_LABELS)
    const line = csv.slice(BOM.length).split('\r\n')[1]
    expect(line.startsWith('2026-05-09,"x",1234,')).toBe(true)
  })

  it('escapes quotes inside a neutralised cell', () => {
    const csv = buildTransactionsCsv([row({ description: '=CONCAT("a")' })], EN_LABELS)
    const line = csv.slice(BOM.length).split('\r\n')[1]
    expect(line).toContain(`"'=CONCAT(""a"")"`)
  })
})

describe('buildExportFilename', () => {
  it('appends Asia/Taipei date in YYYY-MM-DD form', () => {
    expect(buildExportFilename('futari-transactions', SAMPLE))
      .toBe('futari-transactions-2026-05-09.csv')
  })

  it('uses Taipei calendar date for late-UTC instants', () => {
    expect(buildExportFilename('futari-transactions', SAMPLE_LATE_UTC))
      .toBe('futari-transactions-2026-05-10.csv')
  })
})
