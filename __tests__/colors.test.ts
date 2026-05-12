import { describe, it, expect } from 'vitest'
import { lightenHex } from '@/lib/colors'

describe('lightenHex', () => {
  it('returns pure white at amount=0', () => {
    expect(lightenHex('#D4955F', 0)).toBe('#ffffff')
  })

  it('returns the input at amount=1', () => {
    expect(lightenHex('#D4955F', 1)).toBe('#d4955f')
  })

  it('mixes srgb proportionally at the default 0.35 amount', () => {
    // dining red: round(212*0.35 + 255*0.65) = round(240.05) = 240 = 0xF0
    // dining green: round(149*0.35 + 255*0.65) = round(217.9)  = 218 = 0xDA
    // dining blue:  round(95*0.35  + 255*0.65) = round(199)    = 199 = 0xC7
    expect(lightenHex('#D4955F')).toBe('#f0dac7')
  })

  it('preserves 6-digit lowercase output', () => {
    expect(lightenHex('#000000', 0.5)).toBe('#808080')
  })

  it('throws on malformed input so palette typos surface at init', () => {
    expect(() => lightenHex('not-a-color')).toThrow()
    expect(() => lightenHex('#abc')).toThrow()
    expect(() => lightenHex('D4955F')).toThrow()
  })
})
