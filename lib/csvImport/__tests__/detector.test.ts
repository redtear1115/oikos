import { describe, it, expect } from 'vitest'
import { detectFormat, detectSource } from '@/lib/csvImport/detector'

describe('detectSource', () => {
  it('detects Honeydue', () => {
    expect(detectSource(['Date', 'Name', 'Category', 'Amount', 'Account'])).toBe('honeydue')
  })

  it('detects Spendee', () => {
    expect(detectSource(['Date', 'Wallet', 'Type', 'Category name', 'Amount', 'Currency', 'Note'])).toBe('spendee')
  })

  it('detects CWMoney by 中文 headers', () => {
    expect(detectSource(['日期', '類別', '項目', '金額', '帳戶'])).toBe('cwmoney')
  })

  it('detects the futari_generic (ChatGPT) CSV by its date/category/amount/kind columns', () => {
    expect(
      detectSource(['date', 'category', 'amount', 'description', 'currency', 'kind']),
    ).toBe('futari_generic')
  })

  it('detects futari_generic case-insensitively and regardless of optional columns', () => {
    expect(detectSource(['Date', 'Category', 'Amount', 'Kind'])).toBe('futari_generic')
  })

  it('does not treat a date/category/amount file WITHOUT a kind column as futari_generic', () => {
    // `kind` is the distinctive signal; without it this falls through to generic.
    expect(detectSource(['date', 'category', 'amount', 'description'])).toBe('generic')
  })

  it('returns generic for unknown headers', () => {
    expect(detectSource(['foo', 'bar', 'baz'])).toBe('generic')
  })

  it('returns generic for an empty header list', () => {
    expect(detectSource([])).toBe('generic')
  })
})

describe('detectFormat', () => {
  it('detects OFX 1.x SGML by the OFXHEADER prefix', () => {
    expect(detectFormat('OFXHEADER:100\nDATA:OFXSGML\n')).toBe('ofx')
  })

  it('detects OFX 2.x XML by the <?xml + <OFX> combo', () => {
    expect(detectFormat('<?xml version="1.0"?>\n<OFX>\n<BANKMSGSRSV1>')).toBe('ofx')
  })

  it('detects bare <OFX> root element', () => {
    expect(detectFormat('<OFX>\n<BANKMSGSRSV1></BANKMSGSRSV1>\n</OFX>')).toBe('ofx')
  })

  it('detects QIF by the !Type: header', () => {
    expect(detectFormat('!Type:Bank\nD01/15/2026\n')).toBe('qif')
  })

  it('detects QIF by the !Account header', () => {
    expect(detectFormat('!Account\nNChecking\n^\n!Type:Bank\n')).toBe('qif')
  })

  it('falls back to csv for everything else', () => {
    expect(detectFormat('Date,Name,Amount\n2026-01-01,Coffee,-100\n')).toBe('csv')
    expect(detectFormat('foo,bar,baz\n')).toBe('csv')
    expect(detectFormat('')).toBe('csv')
  })

  it('tolerates leading whitespace', () => {
    expect(detectFormat('\n\n  OFXHEADER:100\n')).toBe('ofx')
    expect(detectFormat('\n  !Type:Bank\n')).toBe('qif')
  })
})
