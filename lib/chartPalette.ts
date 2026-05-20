/**
 * Chart-only color tokens (issue #693, follow-up to #670 §1.2).
 *
 * These are the colors charts pick themselves rather than reading off a
 * category/asset record — the per-asset hash palette, the muted "未歸屬"
 * fallback, and the active-bar track overlay. Kept here so the donut and the
 * detail bars share one source of truth instead of duplicating raw hex.
 *
 * Category / income-category slice colors are NOT here: those live with their
 * domain definitions in `lib/categories.ts` / `lib/incomeCategories.ts`.
 */

// Stable per-asset color for the asset breakdown view. Picked from the same hue
// family as the category palette so the chart and detail bars feel coherent
// regardless of which view is active.
export const ASSET_PALETTE = [
  '#D4955F', '#7AA48E', '#C97A8E', '#7A7AB8',
  '#C8A840', '#A89274', '#607090', '#A8998A',
] as const

// 未歸屬 (no asset) bucket — muted grey so it recedes behind named assets.
export const ASSET_NULL_COLOR = '#B5B5C0'

// Translucent white track behind an active detail bar, so the bar reads as
// "lit" against its own tint backdrop.
export const ACTIVE_BAR_TRACK = '#ffffff80'
