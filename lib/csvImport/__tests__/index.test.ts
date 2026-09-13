import { describe, it, expect } from 'vitest'
import { detectFormat, processBuffer, processFile } from '@/lib/csvImport'

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

describe('processFile — filename format hint (#1088)', () => {
  // The import wizard ALWAYS passes a source (the source buttons are a required
  // choice), so the hint has to survive an explicit CSV source or it is dead
  // code on the only path that has a filename at all.
  const WIZARD = { source: 'honeydue' } as const

  // QIF without the leading `!Type:` line: the content sniffer cannot tell it
  // from CSV, which is precisely why the extension hint exists.
  const HEADERLESS_QIF = 'D01/15/2026\nT-500.00\nMCoffee\nLFood:Dining\n^\n'

  it('sniffs the headerless QIF as CSV — the hint is the only signal left', () => {
    expect(detectFormat(HEADERLESS_QIF)).toBe('csv')
  })

  it('routes a .qif through the QIF parser even when the wizard forced a CSV source', async () => {
    const out = await processFile(new File([HEADERLESS_QIF], 'statement.qif'), WIZARD)
    expect(out.source).toBe('qif')
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]!.amount).toBe(500)
    expect(out.rows[0]!.type).toBe('expense')
  })

  it('routes a .ofx through the OFX parser even when the wizard forced a CSV source', async () => {
    const ofx = [
      'OFXHEADER:100',
      '',
      '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>TWD',
      '<BANKTRANLIST>',
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260115<TRNAMT>-250.00<FITID>T1<MEMO>便利商店</STMTTRN>',
      '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
    ].join('\n')
    const out = await processFile(new File([ofx], 'statement.ofx'), WIZARD)
    expect(out.source).toBe('ofx')
    expect(out.rows).toHaveLength(1)
  })

  it('leaves a real CSV on the CSV path — the hint only fires on .ofx / .qif', async () => {
    const csv = 'Date,Name,Category,Amount,Account\n1/15/2026,Costco,Groceries,-250,Joint\n'
    const out = await processFile(new File([csv], 'honeydue-export.csv'), WIZARD)
    expect(out.source).toBe('honeydue')
    expect(out.rows).toHaveLength(1)
  })

  it('does not second-guess a caller that already asked for ofx/qif', async () => {
    const out = await processFile(new File([HEADERLESS_QIF], 'weird-name.csv'), { source: 'qif' })
    expect(out.source).toBe('qif')
  })
})

/**
 * #1094. The screenshot→ChatGPT→CSV workflow (#839 P2) ends at the import
 * wizard, where the only button that fits is 「通用 CSV」 — `futari_generic` is
 * deliberately not offered, it is meant to be recognised. The wizard hands
 * `{ source: 'generic', headerMap: { date: 'Date', amount: 'Amount' } }` to
 * `processFile`, and the prompt we give users produces *lowercase* headers, so
 * `mapGeneric`'s case-sensitive lookup found neither column: three rows in,
 * zero valid rows out, and the user saw 「沒有有效資料」with nothing pointing
 * at the real cause.
 *
 * The header row and sample rows below are copied verbatim from the copy the
 * user is shown — `migrate.chatgptWorkflow.prompt` / `.formatExample` in
 * `lib/i18n/locales/zh-TW.ts`. Change those and this fixture must follow.
 */
describe('generic wizard path — screenshot→ChatGPT→CSV (#1094)', () => {
  const WIZARD_GENERIC = {
    source: 'generic',
    headerMap: { date: 'Date', amount: 'Amount' },
  } as const

  const CHATGPT_CSV = [
    'date,category,amount,description,currency,kind',
    '2026-05-30,飲食,150,星巴克,TWD,expense',
    '2026-05-30,薪水,50000,五月,TWD,income',
    '2026-05-28,交通,1200,東京地鐵,JPY,expense',
  ].join('\n')

  it('parses the ChatGPT output the user actually uploads', async () => {
    const out = await processFile(new File([CHATGPT_CSV], 'chatgpt.csv'), WIZARD_GENERIC)
    // Row count first: zero valid rows is what the user hits — the wizard
    // turns it into 「沒有有效資料」 and the upload dead-ends there.
    expect(out.stats.valid).toBe(3)
    expect(out.stats.invalid).toBe(0)
    expect(out.rows).toHaveLength(3)
    expect(out.source).toBe('futari_generic')
    // The futari_generic mapper, not mapGeneric: `kind` drives the type rather
    // than the amount sign, and non-TWD rows keep their currency tuple.
    expect(out.rows[0]!.type).toBe('expense')
    expect(out.rows[0]!.category).toBe('dining')
    expect(out.rows[1]!.type).toBe('income')
    expect(out.rows[2]!.originalCurrency).toBe('JPY')
  })

  it('still honours the headerMap for a CSV with no signature', () => {
    const csv = 'when,how_much,kind,what\n2026-01-01,100,支出,午餐\n'
    const out = processBuffer(bytes(csv), {
      source: 'generic',
      headerMap: { date: 'when', amount: 'how_much', type: 'kind', description: 'what' },
    })
    expect(out.source).toBe('generic')
    expect(out.rows[0]!.description).toBe('午餐')
  })

  it('does not upgrade a generic pick to one of the three picked sources', () => {
    // Honeydue headers, but the user chose 「通用 CSV」. Only `futari_generic`
    // overrides that choice — everything else keeps the headerMap contract.
    const csv = 'Date,Name,Category,Amount,Account\n1/15/2026,Costco,Groceries,-250,Joint\n'
    const out = processBuffer(bytes(csv), {
      source: 'generic',
      headerMap: { date: 'Date', amount: 'Amount' },
    })
    expect(out.source).toBe('generic')
    expect(out.rows).toHaveLength(1)
  })
})
