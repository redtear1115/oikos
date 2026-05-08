import { describe, it, expect } from 'vitest'
import { formatNhi, NHI_MAX_LENGTH } from '@/lib/format-nhi'

describe('formatNhi', () => {
  it('returns empty string for empty input', () => {
    expect(formatNhi('')).toBe('')
  })

  it('returns empty string when input has no digits', () => {
    expect(formatNhi('abc')).toBe('')
    expect(formatNhi('---')).toBe('')
    expect(formatNhi('   ')).toBe('')
  })

  it('formats 10 digits as 4-4-2', () => {
    expect(formatNhi('1234567890')).toBe('1234 5678 90')
  })

  it('formats 12 digits as 4-4-4', () => {
    expect(formatNhi('123456789012')).toBe('1234 5678 9012')
  })

  it('caps input at 12 digits', () => {
    expect(formatNhi('12345678901234')).toBe('1234 5678 9012')
  })

  it('strips letters and other non-digit characters', () => {
    expect(formatNhi('12-3a 4')).toBe('1234')
    expect(formatNhi('1234abcd5678')).toBe('1234 5678')
  })

  it('groups partial chunks correctly', () => {
    expect(formatNhi('1')).toBe('1')
    expect(formatNhi('1234')).toBe('1234')
    expect(formatNhi('12345')).toBe('1234 5')
    expect(formatNhi('123456789')).toBe('1234 5678 9')
  })

  it('is idempotent when re-applied to its own output', () => {
    const once = formatNhi('123456789012')
    expect(formatNhi(once)).toBe(once)
  })

  it('handles backspace-like state changes (digit removal)', () => {
    // simulate user state where one digit has been removed
    expect(formatNhi('12345678901')).toBe('1234 5678 901')
    expect(formatNhi('1234567890')).toBe('1234 5678 90')
    expect(formatNhi('123456789')).toBe('1234 5678 9')
  })

  it('NHI_MAX_LENGTH equals 12 digits + 2 spaces', () => {
    expect(NHI_MAX_LENGTH).toBe(14)
    // formatted length with full 12 digits should equal NHI_MAX_LENGTH
    expect(formatNhi('123456789012').length).toBe(NHI_MAX_LENGTH)
  })
})
