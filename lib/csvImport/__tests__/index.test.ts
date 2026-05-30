import { describe, it, expect } from 'vitest'
import { processBuffer } from '@/lib/csvImport'

const enc = new TextEncoder()
function bytes(s: string): ArrayBuffer {
  const a = enc.encode(s)
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}

describe('processBuffer — auto-detect routing', () => {
  it('routes Honeydue exports through the Honeydue mapper', () => {
    const csv = [
      'Date,Name,Category,Amount,Account',
      '1/15/2026,Costco,Groceries,-250,Joint',
      '1/16/2026,Coffee,Food & Dining,-80,Joint',
      '1/20/2026,Salary,Income,4000,Joint',
    ].join('\n')
    const out = processBuffer(bytes(csv))
    expect(out.source).toBe('honeydue')
    expect(out.rows).toHaveLength(3)
    expect(out.stats.total).toBe(3)
    expect(out.stats.valid).toBe(3)
    expect(out.stats.invalid).toBe(0)
    expect(out.rows[0]!.type).toBe('expense')
    expect(out.rows[0]!.amount).toBe(250)
    expect(out.rows[2]!.type).toBe('income')
  })

  it('routes Spendee exports through the Spendee mapper', () => {
    const csv = [
      'Date,Wallet,Type,Category name,Amount,Currency,Note',
      '2026-01-15,Cash,Expense,Coffee,120,TWD,latte',
      '2026-02-01,Bank,Income,Salary,40000,TWD,5-month',
    ].join('\n')
    const out = processBuffer(bytes(csv))
    expect(out.source).toBe('spendee')
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0]!.originalCurrency).toBe('TWD')
  })

  it('routes CWMoney 中文 exports through the CWMoney mapper', () => {
    const csv = [
      '日期,類別,項目,金額,帳戶',
      '2026/05/09,餐飲,午餐,250,現金',
      '2026/05/10,交通,捷運,30,現金',
    ].join('\n')
    const out = processBuffer(bytes(csv))
    expect(out.source).toBe('cwmoney')
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0]!.category).toBe('dining')
    expect(out.rows[1]!.category).toBe('transit')
  })

  it('falls back to generic when no source recognised, requires headerMap', () => {
    const csv = 'foo,bar,baz\n2026-01-01,100,note\n'
    expect(() => processBuffer(bytes(csv))).toThrow(/headerMap/)
  })

  it('uses provided headerMap when source=generic', () => {
    const csv = 'when,how_much,kind,what\n2026-01-01,100,支出,午餐\n'
    const out = processBuffer(bytes(csv), {
      headerMap: { date: 'when', amount: 'how_much', type: 'kind', description: 'what' },
    })
    expect(out.source).toBe('generic')
    expect(out.rows[0]!.type).toBe('expense')
    expect(out.rows[0]!.description).toBe('午餐')
  })

  it('accumulates per-row errors instead of throwing', () => {
    const csv = [
      'Date,Name,Category,Amount,Account',
      'not-a-date,Foo,Groceries,-100,Joint',
      '1/16/2026,Bar,Coffee,abc,Joint',
      '1/17/2026,Baz,Coffee,-200,Joint',
    ].join('\n')
    const out = processBuffer(bytes(csv))
    expect(out.stats.total).toBe(3)
    expect(out.stats.valid).toBe(1)
    expect(out.stats.invalid).toBe(2)
    expect(out.errors).toHaveLength(2)
    expect(out.errors[0]!.rowIndex).toBe(0)
    expect(out.errors[1]!.rowIndex).toBe(1)
  })

  it('computes dateRange + topCategories from valid rows', () => {
    const csv = [
      'Date,Name,Category,Amount,Account',
      '1/05/2026,Lunch,Groceries,-100,J',
      '1/10/2026,Coffee,Food & Dining,-50,J',
      '1/20/2026,Bus,Transportation,-30,J',
    ].join('\n')
    const out = processBuffer(bytes(csv))
    expect(out.stats.dateRange).not.toBeNull()
    expect(out.stats.dateRange!.from.getDate()).toBe(5)
    expect(out.stats.dateRange!.to.getDate()).toBe(20)
    expect(out.stats.topCategories[0]).toEqual({ key: 'dining', count: 2 })
  })

  it('handles empty CSV without crashing', () => {
    const out = processBuffer(bytes(''))
    expect(out.stats.total).toBe(0)
    expect(out.rows).toEqual([])
    expect(out.stats.dateRange).toBeNull()
  })

  it('lets caller force a source via options.source', () => {
    const csv = 'Date,Wallet,Type,Category name,Amount,Currency,Note\n2026-01-01,Cash,Expense,Coffee,120,TWD,\n'
    const out = processBuffer(bytes(csv), { source: 'spendee' })
    expect(out.source).toBe('spendee')
    expect(out.rows[0]!.originalCurrency).toBe('TWD')
  })

  it('routes the screenshot→ChatGPT→CSV output through the futari_generic mapper (#839 P2)', () => {
    const csv = [
      'date,category,amount,description,currency,kind',
      '2026-05-30,飲食,150,星巴克,TWD,expense',
      '2026-05-30,薪水,50000,五月,TWD,income',
      '2026-05-28,交通,1200,東京地鐵,JPY,expense',
    ].join('\n')
    const out = processBuffer(bytes(csv))
    expect(out.source).toBe('futari_generic')
    expect(out.rows).toHaveLength(3)
    expect(out.stats.invalid).toBe(0)
    // kind drives type; categories map to Futari ids.
    expect(out.rows[0]!.type).toBe('expense')
    expect(out.rows[0]!.category).toBe('dining')
    expect(out.rows[1]!.type).toBe('income')
    // TWD is base — no tuple; JPY is captured for the import to surface.
    expect(out.rows[0]!.originalCurrency).toBeUndefined()
    expect(out.rows[2]!.originalCurrency).toBe('JPY')
    expect(out.rows[2]!.originalAmount).toBe(1200)
  })
})
