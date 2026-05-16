/**
 * Single source of truth for asset types. UI imports `AssetType` for prop
 * typing and `assetTypeMeta(id)` for label / tint / color lookups.
 *
 * `label` is a TW Chinese default (matches the legacy AssetListItem behavior);
 * locale-aware surfaces continue to use `t.assetDetail.typeLabels[id]`.
 *
 * Adding a new type means: add the row here + the matching `--asset-color-*`
 * / `--asset-tint-*` tokens in app/globals.css + the Drizzle enum value in
 * lib/db/schema.ts. Every downstream consumer then breaks at compile time
 * until updated.
 */
export const ASSET_TYPES = [
  { id: 'car',       label: '車',   tintVar: 'var(--asset-tint-car)',       colorVar: 'var(--asset-color-car)' },
  { id: 'house',     label: '房子', tintVar: 'var(--asset-tint-house)',     colorVar: 'var(--asset-color-house)' },
  { id: 'child',     label: '孩子', tintVar: 'var(--asset-tint-child)',     colorVar: 'var(--asset-color-child)' },
  { id: 'pet',       label: '寵物', tintVar: 'var(--asset-tint-pet)',       colorVar: 'var(--asset-color-pet)' },
  { id: 'plant',     label: '植物', tintVar: 'var(--asset-tint-plant)',     colorVar: 'var(--asset-color-plant)' },
  { id: 'insurance', label: '保險', tintVar: 'var(--asset-tint-insurance)', colorVar: 'var(--asset-color-insurance)' },
  { id: 'item',      label: '物品', tintVar: 'var(--asset-tint-item)',      colorVar: 'var(--asset-color-item)' },
] as const

export type AssetType = (typeof ASSET_TYPES)[number]['id']
export type AssetTypeMeta = (typeof ASSET_TYPES)[number]

const META_BY_ID = Object.fromEntries(
  ASSET_TYPES.map((t) => [t.id, t]),
) as Record<AssetType, AssetTypeMeta>

export function assetTypeMeta(type: AssetType): AssetTypeMeta {
  return META_BY_ID[type]
}
