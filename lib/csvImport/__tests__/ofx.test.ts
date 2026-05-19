import { describe, it, expect } from 'vitest'
import { parseOfx } from '@/lib/csvImport/ofxParser'
import { processBuffer } from '@/lib/csvImport'

const enc = new TextEncoder()
function bytes(s: string): ArrayBuffer {
  const a = enc.encode(s)
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}

// OFX 1.x SGML — leaf tags have no closing tag, fields end at newline.
const SGML_FIXTURE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:NONE
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>0
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>123456789
<ACCTID>987654321
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260115
<TRNAMT>-500.00
<FITID>TXN1
<MEMO>便利商店
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260120
<TRNAMT>4000.00
<FITID>TXN2
<NAME>Acme Corp Salary
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`

// OFX 2.x — proper XML with closing tags
const XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="200" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260315120000</DTPOSTED>
            <TRNAMT>-1250</TRNAMT>
            <MEMO>Costco run</MEMO>
          </STMTTRN>
          <STMTTRN>
            <TRNTYPE>CREDIT</TRNTYPE>
            <DTPOSTED>20260316</DTPOSTED>
            <TRNAMT>200</TRNAMT>
            <MEMO>Refund &amp; rebate</MEMO>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`

describe('parseOfx — SGML (OFX 1.x)', () => {
  it('parses each STMTTRN block', () => {
    const rows = parseOfx(SGML_FIXTURE)
    expect(rows).toHaveLength(2)
  })

  it('reads YYYYMMDD dates', () => {
    const rows = parseOfx(SGML_FIXTURE)
    expect(rows[0]!.date?.getFullYear()).toBe(2026)
    expect(rows[0]!.date?.getMonth()).toBe(0)
    expect(rows[0]!.date?.getDate()).toBe(15)
  })

  it('flips negative TRNAMT to expense + positive amount', () => {
    const rows = parseOfx(SGML_FIXTURE)
    expect(rows[0]!.type).toBe('expense')
    expect(rows[0]!.amount).toBe(500)
  })

  it('treats positive TRNAMT as income', () => {
    const rows = parseOfx(SGML_FIXTURE)
    expect(rows[1]!.type).toBe('income')
    expect(rows[1]!.amount).toBe(4000)
  })

  it('uses MEMO when present, falls back to NAME', () => {
    const rows = parseOfx(SGML_FIXTURE)
    expect(rows[0]!.description).toBe('便利商店')
    expect(rows[1]!.description).toBe('Acme Corp Salary')
  })

  it('always sets paidBy=viewer and splitType=half', () => {
    const rows = parseOfx(SGML_FIXTURE)
    for (const r of rows) {
      expect(r.paidBy).toBe('viewer')
      expect(r.splitType).toBe('half')
    }
  })
})

describe('parseOfx — XML (OFX 2.x)', () => {
  it('parses STMTTRN blocks with closing tags', () => {
    const rows = parseOfx(XML_FIXTURE)
    expect(rows).toHaveLength(2)
  })

  it('handles datetime DTPOSTED (YYYYMMDDHHMMSS) by taking the date portion', () => {
    const rows = parseOfx(XML_FIXTURE)
    expect(rows[0]!.date?.getMonth()).toBe(2)
    expect(rows[0]!.date?.getDate()).toBe(15)
  })

  it('decodes XML entities in MEMO', () => {
    const rows = parseOfx(XML_FIXTURE)
    expect(rows[1]!.description).toBe('Refund & rebate')
  })
})

describe('parseOfx — edge cases', () => {
  it('returns an empty array for content with no STMTTRN', () => {
    expect(parseOfx('<OFX><STATUS><CODE>0</CODE></STATUS></OFX>')).toEqual([])
  })

  it('skips rows missing TRNAMT or DTPOSTED', () => {
    const partial = `<OFX><STMTTRN><MEMO>orphan</MEMO></STMTTRN></OFX>`
    expect(parseOfx(partial)).toEqual([])
  })

  it('skips rows with unparseable TRNAMT', () => {
    const bad = `<OFX><STMTTRN><DTPOSTED>20260101</DTPOSTED><TRNAMT>not-a-number</TRNAMT></STMTTRN></OFX>`
    expect(parseOfx(bad)).toEqual([])
  })

  it('skips rows with invalid calendar dates', () => {
    const bad = `<OFX><STMTTRN><DTPOSTED>20260230</DTPOSTED><TRNAMT>-100</TRNAMT></STMTTRN></OFX>`
    expect(parseOfx(bad)).toEqual([])
  })
})

describe('processBuffer integration — OFX', () => {
  it('auto-detects SGML OFX and validates rows', () => {
    const out = processBuffer(bytes(SGML_FIXTURE))
    expect(out.source).toBe('ofx')
    expect(out.stats.total).toBe(2)
    expect(out.stats.valid).toBe(2)
    expect(out.rows[0]!.type).toBe('expense')
    expect(out.rows[1]!.type).toBe('income')
  })

  it('auto-detects XML OFX', () => {
    const out = processBuffer(bytes(XML_FIXTURE))
    expect(out.source).toBe('ofx')
    expect(out.stats.total).toBe(2)
  })

  it('respects an explicit source=ofx override', () => {
    const out = processBuffer(bytes(XML_FIXTURE), { source: 'ofx' })
    expect(out.source).toBe('ofx')
    expect(out.rows).toHaveLength(2)
  })
})
