export interface IncomePalette {
  name: string
  ink: string
  tint: string
  glow: string
  whisper: string
  sheetBg: string
}

export const INCOME_PALETTES = {
  mint:  { name: '薄荷', ink: '#3F6A56', tint: '#DDEAD8', glow: '#E5F0DE', whisper: '#F2F7EE', sheetBg: '#F4F8EF' },
  gold:  { name: '淺金', ink: '#8A6E2E', tint: '#F2E8CF', glow: '#F7EBC2', whisper: '#FBF5E5', sheetBg: '#FBF5E5' },
  cream: { name: '暖白', ink: '#7A5848', tint: '#F5EBDF', glow: '#FFEEDD', whisper: '#FDF7EE', sheetBg: '#FDF7EE' },
} satisfies Record<string, IncomePalette>

export const DEFAULT_INCOME_PALETTE = INCOME_PALETTES.mint
