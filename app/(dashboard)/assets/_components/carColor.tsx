// Shared car-color visual helpers — used by both the assets list CarHeroCard
// and the asset detail AssetHero so the two surfaces stay visually consistent.

export const FALLBACK_CAR_COLOR = '#E8E4D8'

/**
 * Source of truth for the 8 mainstream car colors. Keys are stored in the DB
 * (`CarDetails.color`); hex values are what the UI renders.
 *
 * Must stay in sync with `CAR_COLORS` in AssetSheet.tsx — the picker writes
 * keys, this map reads them. If you add a swatch to one, add it to the other.
 */
export const CAR_SWATCHES: Record<string, string> = {
  white:     '#F0EDE8',
  black:     '#1C1C1E',
  silver:    '#B8B8C0',
  dark_gray: '#4A4A52',
  dark_red:  '#7B2525',
  dark_blue: '#1E3557',
  brown:     '#7A5C3E',
  champagne: '#C8A97A',
}

/**
 * Translate a stored color key into a CSS-safe hex. Without this, raw keys
 * like `'dark_gray'` / `'champagne'` aren't valid CSS color names and silently
 * fail to render. The `?? key` tail keeps the function defensive in case a row
 * already holds a hex (legacy data) — the value passes through unchanged.
 */
export function resolveCarColor(key: string | null | undefined): string {
  if (!key) return FALLBACK_CAR_COLOR
  return CAR_SWATCHES[key] ?? key
}

/** Rec.601 luma; <128 means dark enough that we should use light foreground. */
export function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma < 128
}

/**
 * Compose the swatch background. Light swatches get a subtle dark overlay so
 * the AssetMark + plate badge always have visible contrast — without this,
 * pale colors (#F0EDE8 white, #C8A97A champagne) make the mark look faint.
 */
export function carBandBackground(swatch: string): string {
  const dark = isDarkColor(swatch)
  if (dark) return swatch
  // Light variant: ~5% dark overlay via stacked linear-gradient
  return `linear-gradient(rgba(58,36,25,0.05), rgba(58,36,25,0.05)), ${swatch}`
}

/** Foreground colors for a given car swatch — used for name / back btn / mark. */
export function carForeground(swatch: string) {
  const dark = isDarkColor(swatch)
  return {
    dark,
    ink:        dark ? '#FFF6EC' : '#3A2419',
    inkSoft:    dark ? 'rgba(255,255,255,0.60)' : 'rgba(58,36,25,0.55)',
    inkSofter:  dark ? 'rgba(255,255,255,0.45)' : 'rgba(58,36,25,0.40)',
    btnBg:      dark ? 'rgba(255,255,255,0.10)' : 'rgba(58,36,25,0.08)',
    plateBg:    dark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.55)',
    plateInk:   dark ? '#FFF6EC' : '#3A2419',
    overlayBg:  dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)',
    markStroke: dark ? '#FFFFFF' : '#3A2419',
    // Stronger accent on light variants — old #8A7B5A washed out on pale colors
    markAccent: dark ? '#E08856' : '#5A4A30',
    orbitOpacity: dark ? 0.30 : 0.45,
  }
}

interface CarMarkProps {
  size?: number
}

/** Line-style car mark — designed to live on a colored band. Reads its own
 *  context via parent style/CSS-vars-free props; pass the resolved fg via
 *  carForeground(). */
export function CarMark({ size = 84, stroke, accent, orbitOpacity = 0.3 }: CarMarkProps & {
  stroke: string; accent: string; orbitOpacity?: number
}) {
  const sw = 1.8
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="29.5" stroke={accent} strokeOpacity={orbitOpacity}
        strokeWidth="1.3" strokeDasharray="1.5 3" fill="none" />
      <path d="M 12 38 L 14 30 C 14.5 27, 16 25.5, 19 25 L 27 23.5 C 30.5 23, 33.5 23, 37 23.5 L 45 25 C 48 25.5, 49.5 27, 50 30 L 52 38"
        stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M 10 42 L 10 38 L 54 38 L 54 42"
        stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M 20 30 L 23 25 M 44 30 L 41 25" stroke={stroke} strokeWidth={sw * 0.8}
        strokeLinecap="round" fill="none" opacity="0.55" />
      <circle cx="20" cy="44" r="3.5" fill={stroke} />
      <circle cx="44" cy="44" r="3.5" fill={accent} />
    </svg>
  )
}
