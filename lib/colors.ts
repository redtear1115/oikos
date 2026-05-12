/**
 * Color token primitives shared by category / income / asset palettes.
 *
 * Issue #149 — every category & asset type now declares a single primary
 * `color`. The lighter `tint` used for chip backgrounds is derived from it
 * via `lightenHex()` so the chip a user sees in a feed and the donut slice
 * they see on the same screen are guaranteed to be in the same hue family.
 */

const HEX_RE = /^#([0-9a-fA-F]{6})$/

/**
 * Mix a hex color with white. `amount` is the share of the original color
 * (0 = pure white, 1 = original color). Defaults to 0.35 which lands close
 * to the previously hand-picked `tint` values while bumping saturation just
 * enough that the chip reads as the same hue as its donut slice.
 *
 * Throws on malformed input so palette typos fail at module-init rather
 * than render time.
 */
export function lightenHex(hex: string, amount = 0.35): string {
  const m = HEX_RE.exec(hex)
  if (!m) throw new Error(`lightenHex: expected #RRGGBB, got ${hex}`)
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}
