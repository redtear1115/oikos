import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import { isValidIncomeCategoryId, type IncomeCategoryId } from '@/lib/incomeCategories'

/**
 * Drill-down filter, set by tapping a detail bar in the monthly stats card.
 * Mutually exclusive with itself — only one drill kind is active at a time.
 *
 * - `category`: expense category (e.g. 飲食)
 * - `asset`:    愛物 row; `assetId === null` represents the「其他」(no-asset) bar
 * - `income`:   income category (e.g. 薪水)
 */
export type DrillFilter =
  | { kind: 'category'; categoryId: CategoryId }
  | { kind: 'asset'; assetId: string | null }
  | { kind: 'income'; categoryId: IncomeCategoryId }

/** URL-param name → drill kind mapping. Only one of these should be set. */
export const DRILL_PARAM_CATEGORY = 'drillCategory'
export const DRILL_PARAM_ASSET = 'drillAsset'
export const DRILL_PARAM_INCOME = 'drillIncomeCategory'
/** Sentinel for the「其他」(asset_id IS NULL) bar — empty string would clash with absent param. */
export const DRILL_ASSET_NONE = '__none__'

/**
 * Asset ids in our schema are uuids. We re-validate from URL params before
 * passing through to SQL — Postgres throws on a malformed uuid cast, and we'd
 * rather treat a tampered ?drillAsset=foo as "no drill" than crash the page.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isValidAssetIdString(s: string): boolean {
  return s === DRILL_ASSET_NONE || UUID_RE.test(s)
}

/** Best-effort parse from a search-params bag. Returns null if no/invalid drill is set. */
export function parseDrillFromSearchParams(
  params: { get(name: string): string | null } | URLSearchParams,
): DrillFilter | null {
  const cat = params.get(DRILL_PARAM_CATEGORY)
  if (cat && isValidCategoryId(cat) && cat !== 'settle') {
    return { kind: 'category', categoryId: cat as CategoryId }
  }
  const asset = params.get(DRILL_PARAM_ASSET)
  if (asset !== null && asset !== '' && isValidAssetIdString(asset)) {
    return { kind: 'asset', assetId: asset === DRILL_ASSET_NONE ? null : asset }
  }
  const inc = params.get(DRILL_PARAM_INCOME)
  if (inc && isValidIncomeCategoryId(inc)) {
    return { kind: 'income', categoryId: inc as IncomeCategoryId }
  }
  return null
}

/** Plain-record variant for Next.js server-component searchParams. */
export function parseDrillFromRecord(rec: {
  drillCategory?: string
  drillAsset?: string
  drillIncomeCategory?: string
}): DrillFilter | null {
  if (rec.drillCategory && isValidCategoryId(rec.drillCategory) && rec.drillCategory !== 'settle') {
    return { kind: 'category', categoryId: rec.drillCategory as CategoryId }
  }
  if (
    rec.drillAsset !== undefined &&
    rec.drillAsset !== '' &&
    isValidAssetIdString(rec.drillAsset)
  ) {
    return {
      kind: 'asset',
      assetId: rec.drillAsset === DRILL_ASSET_NONE ? null : rec.drillAsset,
    }
  }
  if (rec.drillIncomeCategory && isValidIncomeCategoryId(rec.drillIncomeCategory)) {
    return { kind: 'income', categoryId: rec.drillIncomeCategory as IncomeCategoryId }
  }
  return null
}

/** Stable string key — used for React keys / dependency arrays. */
export function drillKey(d: DrillFilter | null): string {
  if (!d) return ''
  if (d.kind === 'category') return `cat:${d.categoryId}`
  if (d.kind === 'asset') return `asset:${d.assetId ?? DRILL_ASSET_NONE}`
  return `income:${d.categoryId}`
}

/**
 * Mutate a URLSearchParams to set/clear drill params. Always strips the other
 * two so only one drill is encoded at a time.
 */
export function applyDrillToParams(
  params: URLSearchParams,
  drill: DrillFilter | null,
): void {
  params.delete(DRILL_PARAM_CATEGORY)
  params.delete(DRILL_PARAM_ASSET)
  params.delete(DRILL_PARAM_INCOME)
  if (!drill) return
  if (drill.kind === 'category') params.set(DRILL_PARAM_CATEGORY, drill.categoryId)
  else if (drill.kind === 'asset')
    params.set(DRILL_PARAM_ASSET, drill.assetId ?? DRILL_ASSET_NONE)
  else params.set(DRILL_PARAM_INCOME, drill.categoryId)
}

/** Wire-format for Server Action arg serialisation (avoids null/undefined ambiguity). */
export interface DrillFilterWire {
  kind: 'category' | 'asset' | 'income'
  /** For asset kind only, the `assetId === null` (no-asset) case is encoded as DRILL_ASSET_NONE. */
  id: string
}

export function toDrillWire(d: DrillFilter): DrillFilterWire {
  if (d.kind === 'category') return { kind: 'category', id: d.categoryId }
  if (d.kind === 'asset')
    return { kind: 'asset', id: d.assetId ?? DRILL_ASSET_NONE }
  return { kind: 'income', id: d.categoryId }
}

export function fromDrillWire(w: DrillFilterWire): DrillFilter {
  if (w.kind === 'category') return { kind: 'category', categoryId: w.id as CategoryId }
  if (w.kind === 'asset')
    return { kind: 'asset', assetId: w.id === DRILL_ASSET_NONE ? null : w.id }
  return { kind: 'income', categoryId: w.id as IncomeCategoryId }
}

/**
 * Check whether a drill is meaningful for the current records tab. We hide the
 * chip + skip filtering when it isn't — e.g. an expense-category drill on the
 * 收入 tab would always return zero rows, which is more confusing than helpful.
 */
export function drillAppliesToTab(
  drill: DrillFilter | null,
  tab: 'all' | 'expense' | 'income',
): boolean {
  if (!drill) return false
  if (tab === 'all') return true
  if (tab === 'expense') return drill.kind === 'category' || drill.kind === 'asset'
  return drill.kind === 'income'
}
