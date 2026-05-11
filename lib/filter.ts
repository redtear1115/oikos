import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

/** Single-select dimensions use 'all' to mean "no filter". Multi-select dimensions use empty Set. */
export type PayerFilter = 'all' | 'mine' | 'theirs'
export type SplitFilter = 'all' | SplitType  // 'all' | 'all_mine' | 'all_theirs' | 'half'

/**
 * Date scope. `month` is the legacy single-month mode (drives MonthSwitcher);
 * `range` is a custom user-picked window. Pre-resolved presets ("本月" / "上月")
 * collapse into `month` so the URL stays compact.
 */
export type DateRange =
  | { kind: 'month'; monthKey: string }
  | { kind: 'range'; start: string; end: string }   // both YYYY-MM-DD inclusive
  | { kind: 'all' }

/** Sentinel for the「未歸屬」(asset_id IS NULL) bucket in the asset filter. */
export const ASSET_FILTER_NONE = '__none__'

export interface TxnFilter {
  payer: PayerFilter
  split: SplitFilter
  /** Empty set = no category filter. Includes only transaction CategoryIds; 'settle' is never selectable. */
  categories: Set<CategoryId>
  /**
   * Empty set = no asset filter. Members are asset uuids OR the ASSET_FILTER_NONE
   * sentinel for transactions/income with no asset_id (歸「未歸屬」). Multi-select.
   */
  assetIds: Set<string>
}

export function defaultFilter(): TxnFilter {
  return {
    payer: 'all',
    split: 'all',
    categories: new Set(),
    assetIds: new Set(),
  }
}

/** True if any dimension would narrow the feed. */
export function isFilterActive(f: TxnFilter): boolean {
  return (
    f.payer !== 'all' ||
    f.split !== 'all' ||
    f.categories.size > 0 ||
    f.assetIds.size > 0
  )
}

/** True if ANY transaction-only dimension is active (split or categories). Used to decide
 *  whether settlements should be hidden — settlements have no split_type / category, so
 *  applying those dims to them is meaningless and the safest UX is to hide them.
 *  The asset dimension also drops settlements (settlements have no asset). */
export function hidesSettlements(f: TxnFilter): boolean {
  return f.split !== 'all' || f.categories.size > 0 || f.assetIds.size > 0
}

/** Serialize for transport over server-action boundary (Sets aren't structured-clonable
 *  through Server Action arg serialization in some Next versions; we send arrays). */
export interface TxnFilterWire {
  payer: PayerFilter
  split: SplitFilter
  categories: CategoryId[]
  assetIds: string[]
}

export function toWire(f: TxnFilter): TxnFilterWire {
  return {
    payer: f.payer,
    split: f.split,
    categories: Array.from(f.categories),
    assetIds: Array.from(f.assetIds),
  }
}

export function fromWire(w: TxnFilterWire): TxnFilter {
  return {
    payer: w.payer,
    split: w.split,
    categories: new Set(w.categories),
    assetIds: new Set(w.assetIds ?? []),
  }
}

/** Minimal row shape for filter matching — fields any feed row will have. */
export interface FilterableRow {
  paidBy: string
  splitType: SplitType | null   // null for settlements
  category: string              // 'settle' for settlements
  kind: 'transaction' | 'settlement'
  /** null when the row is unassigned (matches against ASSET_FILTER_NONE). */
  assetId?: string | null
}

/**
 * Returns whether a row passes the given filter.
 *
 * @param row - The row to test
 * @param filter - The active filter
 * @param viewerId - The signed-in user's id (used to resolve 'mine'/'theirs')
 * @param partnerId - The partner's user id (or null if no partner yet)
 */
export function matchesFilter(
  row: FilterableRow,
  filter: TxnFilter,
  viewerId: string,
  partnerId: string | null,
): boolean {
  // 誰付 dimension applies to both transactions and settlements
  if (filter.payer === 'mine' && row.paidBy !== viewerId) return false
  if (filter.payer === 'theirs') {
    if (!partnerId || row.paidBy !== partnerId) return false
  }

  // Settlements pass through if no transaction-only dim is active.
  // If split, categories, OR assetIds filter is active, settlements are dropped
  // entirely (they have no split_type / category / asset_id).
  if (row.kind === 'settlement') {
    return !hidesSettlements(filter)
  }

  // 分攤 dimension — transactions only
  if (filter.split !== 'all' && row.splitType !== filter.split) return false

  // 分類 dimension — transactions only
  if (filter.categories.size > 0 && !filter.categories.has(row.category as CategoryId)) {
    return false
  }

  // 愛物 dimension — transactions only. ASSET_FILTER_NONE matches rows with
  // assetId === null; concrete uuids match by equality. Membership in EITHER
  // case = pass.
  if (filter.assetIds.size > 0) {
    const key = row.assetId ?? ASSET_FILTER_NONE
    if (!filter.assetIds.has(key)) return false
  }

  return true
}

// ─── URL serialization ────────────────────────────────────────────────────────
//
// The structured filter encodes into URL search params so the entire view is
// shareable: opening a Futari URL on either partner's device reproduces the
// same filtered window. Param names are short to keep links readable when
// pasted into chat. All params are optional — absent = default (no filter).
//
//   ?fPayer=mine|theirs               (default 'all' = absent)
//   ?fSplit=all_mine|all_theirs|half|weighted
//   ?fCats=dining,transit             (comma-separated CategoryIds)
//   ?fAssets=<uuid>,<uuid>,__none__   (comma-separated; sentinel for no-asset)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD    (custom date range; both required together)
//   ?range=all                        (sentinel for "all-time"; overrides ?month)
//   ?month=YYYY-MM                    (legacy single-month scope; pre-existing)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function isValidPayer(s: string | null): s is PayerFilter {
  return s === 'mine' || s === 'theirs' || s === 'all'
}
function isValidSplit(s: string | null): s is SplitFilter {
  return s === 'all' || s === 'all_mine' || s === 'all_theirs' || s === 'half' || s === 'weighted'
}
function isValidAssetMember(s: string): boolean {
  return s === ASSET_FILTER_NONE || UUID_RE.test(s)
}

/**
 * Best-effort parse of TxnFilter dimensions from a search-params bag.
 * Returns the filter (and any unknown / malformed values are silently dropped
 * rather than throwing — a tampered URL becomes "no filter on that dim", not
 * a crashed page).
 */
export function parseFilterFromSearchParams(
  params: { get(name: string): string | null } | URLSearchParams,
): TxnFilter {
  const f = defaultFilter()

  const payer = params.get('fPayer')
  if (payer && isValidPayer(payer) && payer !== 'all') f.payer = payer

  const split = params.get('fSplit')
  if (split && isValidSplit(split) && split !== 'all') f.split = split

  const cats = params.get('fCats')
  if (cats) {
    for (const id of cats.split(',')) {
      const trimmed = id.trim()
      if (trimmed && isValidCategoryId(trimmed) && trimmed !== 'settle') {
        f.categories.add(trimmed as CategoryId)
      }
    }
  }

  const assets = params.get('fAssets')
  if (assets) {
    for (const id of assets.split(',')) {
      const trimmed = id.trim()
      if (trimmed && isValidAssetMember(trimmed)) {
        f.assetIds.add(trimmed)
      }
    }
  }

  return f
}

/** Plain-record variant for Next.js server-component searchParams. */
export function parseFilterFromRecord(rec: {
  fPayer?: string
  fSplit?: string
  fCats?: string
  fAssets?: string
}): TxnFilter {
  const fakeParams = {
    get: (name: string) => {
      const k = name as keyof typeof rec
      return (rec[k] as string | undefined) ?? null
    },
  }
  return parseFilterFromSearchParams(fakeParams)
}

/**
 * Mutate a URLSearchParams to encode `f`. Each dim is set when active, removed
 * when default. Use this both for "apply filter" navigation and for building
 * shareable URLs.
 */
export function applyFilterToParams(params: URLSearchParams, f: TxnFilter): void {
  if (f.payer !== 'all') params.set('fPayer', f.payer)
  else params.delete('fPayer')

  if (f.split !== 'all') params.set('fSplit', f.split)
  else params.delete('fSplit')

  if (f.categories.size > 0) params.set('fCats', Array.from(f.categories).sort().join(','))
  else params.delete('fCats')

  if (f.assetIds.size > 0) params.set('fAssets', Array.from(f.assetIds).sort().join(','))
  else params.delete('fAssets')
}

// ─── Date range URL encoding ──────────────────────────────────────────────────

/**
 * Read the active DateRange from URL params. Precedence:
 *   1. `?range=all`              → all-time
 *   2. `?from=…&to=…` (both valid, from <= to) → custom range
 *   3. `?month=YYYY-MM`          → legacy single-month
 *   4. fallback                  → caller-provided default month
 *
 * Tampered values fall through to the next option (or default), never throw.
 */
export function parseDateRangeFromSearchParams(
  params: { get(name: string): string | null } | URLSearchParams,
  defaultMonthKey: string,
): DateRange {
  const range = params.get('range')
  if (range === 'all') return { kind: 'all' }

  const from = params.get('from')
  const to = params.get('to')
  if (from && to && ISO_DATE_RE.test(from) && ISO_DATE_RE.test(to) && from <= to) {
    return { kind: 'range', start: from, end: to }
  }

  const month = params.get('month')
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { kind: 'month', monthKey: month }
  }

  return { kind: 'month', monthKey: defaultMonthKey }
}

/** Plain-record variant for Next.js server-component searchParams. */
export function parseDateRangeFromRecord(
  rec: { range?: string; from?: string; to?: string; month?: string },
  defaultMonthKey: string,
): DateRange {
  const fakeParams = {
    get: (name: string) => {
      const k = name as keyof typeof rec
      return (rec[k] as string | undefined) ?? null
    },
  }
  return parseDateRangeFromSearchParams(fakeParams, defaultMonthKey)
}

/**
 * Mutate URLSearchParams to encode the date range. Always strips the other two
 * date params (range / from+to / month) so only one mode is active at a time.
 */
export function applyDateRangeToParams(params: URLSearchParams, r: DateRange): void {
  params.delete('range')
  params.delete('from')
  params.delete('to')
  params.delete('month')

  if (r.kind === 'all') {
    params.set('range', 'all')
  } else if (r.kind === 'range') {
    params.set('from', r.start)
    params.set('to', r.end)
  } else {
    params.set('month', r.monthKey)
  }
}

/**
 * Resolve a DateRange to an inclusive (start, end-exclusive) pair of
 * YYYY-MM-DD strings, used as bounds in SQL queries against IncomeTransactions
 * (date column). Used by the DB layer's filter resolution. Returns null for
 * `all` (no bound).
 */
export function resolveDateRangeToDateBounds(
  r: DateRange,
): { startDate: string; endDateExclusive: string } | null {
  if (r.kind === 'all') return null
  if (r.kind === 'range') {
    const next = nextDateIso(r.end)
    return { startDate: r.start, endDateExclusive: next }
  }
  // month: YYYY-MM-01 → next month YYYY-MM-01
  return {
    startDate: `${r.monthKey}-01`,
    endDateExclusive: `${addMonthsToYearMonth(r.monthKey, 1)}-01`,
  }
}

function nextDateIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function addMonthsToYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = ((idx % 12) + 12) % 12 + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}
