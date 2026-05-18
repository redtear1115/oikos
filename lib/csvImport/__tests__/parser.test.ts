import { describe, it, expect } from 'vitest'
import { detectEncoding, detectSeparator, parseCsvBuffer, parseCsvText } from '@/lib/csvImport/parser'

const enc = new TextEncoder()
function toBuffer(s: string, bom = false): ArrayBuffer {
  const arr = enc.encode((bom ? '﻿' : '') + s)
  return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
}

describe('detectEncoding', () => {
  it('reports utf-8 for plain ASCII', () => {
    expect(detectEncoding(toBuffer('date,amount\n2026-01-01,100\n'))).toBe('utf-8')
  })

  it('reports utf-8-bom for BOM-prefixed text', () => {
    expect(detectEncoding(toBuffer('date,amount\n', true))).toBe('utf-8-bom')
  })

  it('reports big5 when bytes are invalid UTF-8', () => {
    // 日期,金額\n in Big5
    const big5 = new Uint8Array([0xA4, 0xE9, 0xB4, 0xC1, 0x2C, 0xAA, 0xF7, 0xC3, 0x42, 0x0A])
    const buf = big5.buffer.slice(big5.byteOffset, big5.byteOffset + big5.byteLength) as ArrayBuffer
    expect(detectEncoding(buf)).toBe('big5')
  })
})

describe('detectSeparator', () => {
  it('picks comma when commas dominate', () => {
    expect(detectSeparator('date,amount,note')).toBe(',')
  })

  it('picks tab when tabs dominate', () => {
    expect(detectSeparator('date\tamount\tnote')).toBe('\t')
  })

  it('falls back to comma on a tie', () => {
    expect(detectSeparator('a')).toBe(',')
    expect(detectSeparator('a\tb,c')).toBe(',')
  })
})

describe('parseCsvBuffer / parseCsvText', () => {
  it('parses headers + rows from a buffer with comma separator', () => {
    const out = parseCsvBuffer(toBuffer('date,amount\n2026-01-01,100\n2026-01-02,200\n'))
    expect(out.headers).toEqual(['date', 'amount'])
    expect(out.separator).toBe(',')
    expect(out.rows).toEqual([
      { date: '2026-01-01', amount: '100' },
      { date: '2026-01-02', amount: '200' },
    ])
  })

  it('parses TSV when tabs dominate the header', () => {
    const out = parseCsvText('date\tamount\n2026-01-01\t100\n')
    expect(out.separator).toBe('\t')
    expect(out.headers).toEqual(['date', 'amount'])
    expect(out.rows).toEqual([{ date: '2026-01-01', amount: '100' }])
  })

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const out = parseCsvText('a,b\n"hello, world","she said ""hi"""\n')
    expect(out.rows).toEqual([{ a: 'hello, world', b: 'she said "hi"' }])
  })

  it('handles CRLF line endings', () => {
    const out = parseCsvText('a,b\r\n1,2\r\n3,4\r\n')
    expect(out.rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ])
  })

  it('trims header whitespace', () => {
    const out = parseCsvText(' date , amount \n2026-01-01,100\n')
    expect(out.headers).toEqual(['date', 'amount'])
    expect(out.rows[0]).toEqual({ date: '2026-01-01', amount: '100' })
  })

  it('returns empty result for an empty buffer', () => {
    const out = parseCsvBuffer(toBuffer(''))
    expect(out.headers).toEqual([])
    expect(out.rows).toEqual([])
  })

  it('strips BOM before parsing', () => {
    const out = parseCsvBuffer(toBuffer('date,amount\n2026-01-01,100\n', true))
    expect(out.headers).toEqual(['date', 'amount'])
    expect(out.rows[0]).toEqual({ date: '2026-01-01', amount: '100' })
  })
})
