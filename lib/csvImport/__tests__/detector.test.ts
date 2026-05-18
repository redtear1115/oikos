import { describe, it, expect } from 'vitest'
import { detectSource } from '@/lib/csvImport/detector'

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

  it('returns generic for unknown headers', () => {
    expect(detectSource(['foo', 'bar', 'baz'])).toBe('generic')
  })

  it('returns generic for an empty header list', () => {
    expect(detectSource([])).toBe('generic')
  })
})
