import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import { isValidIncomeCategoryId, type IncomeCategoryId } from '@/lib/incomeCategories'
import type { SplitType } from '@/lib/balance'
import type { RecordStatus } from '@/lib/validators'

/** Single-select dimensions use 'all' to mean "no filter". Multi-select dimensions use empty Set. */
export type PayerFilter = 'all' | 'mine' | 'theirs'
/**
 * Split-type filter. Concrete `SplitType` values map to a single DB
 * split_type each. `'shared'` is a UI-level aggregate matching the two
 * ratio-based modes (`half` + `weighted`) under one user-facing label.
 *
 * NOTE: "viewer-bears-cost" and "partner-bears-cost" are NOT expressible
 * as a single SplitFilter value — split_type is payer-relative (`all_mine`
 * means "all on the payer", not "all on the viewer"), so resolving "who
 * really pays" requires a join with `paid_by`. See `BurdenFilter` below
 * for that dimension.
 */
export type SplitFilter = 'all' | SplitType | 'shared'

/**
 * Burden filter — who actually bears the cost of a record, after netting
 * payer × split_type. Requires viewer context to evaluate (the in-memory
 * matcher takes viewerId + partnerId; the SQL layer takes them too via
 * `ResolvedTxnFilter.burden`).
 *
 * `'mine'`  matches: (paid_by = viewer ∧ split = all_mine)
 *                  ∨ (paid_by = partner ∧ split = all_theirs)
 *                  ∨ split ∈ {half, weighted}
 *
 * `'theirs'` matches: (paid_by = partner ∧ split = all_mine)
 *                   ∨ (paid_by = viewer ∧ split = all_theirs)
 *                   ∨ split ∈ {half, weighted}
 *
 * Settlements + income rows have no split_type and are dropped whenever
 * `burden !== 'all'` (same shape as the split dim).
 */
export type BurdenFilter = 'all' | 'mine' | 'theirs'
/** Status filter — 'pending'/'settled' from RecordStatus, plus 'all' sentinel for no filter. */
export type StatusFilter = 'all' | RecordStatus

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
  /**
   * Burden filter — see `BurdenFilter` doc above. `'all'` = no filter.
   * Powered by the Dashboard L3「我負擔」/「對方負擔」dual toggle.
   * Independent from `payer` (誰付) and `split` (DB split_type): all three
   * dimensions AND together, but `burden` resolves the payer × split
   * cross-product that neither dimension can express alone.
   */
  burden: BurdenFilter
  /** Empty set = no expense-category filter. Only transaction CategoryIds; 'settle' is never selectable. */
  categories: Set<CategoryId>
  /** Empty set = no income-category filter. Multi-select over IncomeCategoryIds. */
  incomeCategories: Set<IncomeCategoryId>
  /**
   * Empty set = no asset filter. Members are asset uuids OR the ASSET_FILTER_NONE
   * sentinel for transactions/income with no asset_id (歸「未歸屬」). Multi-select.
   */
  assetIds: Set<string>
  /**
   * Inclusive lower / upper bounds on row amount (NT$ integers). `null` = open
   * on that side. Both null = no amount filter. `min > max` is tolerated
   * (matches nothing) so the SQL doesn't have to special-case the inversion.
   */
  amountMin: number | null
  amountMax: number | null
  /**
   * Status filter (v2). 'all' = no filter; 'pending' = only未扣款 cash; 'settled'
   * = only已扣款. Settlements + IncomeTransactions are always 'settled', so a
   * 'pending' filter drops them entirely (mirrors how the split / category dims
   * drop settlements). The cross-kind cut for 'pending' is wired through
   * `cutsIncome` / `hidesSettlements`.
   */
  status: StatusFilter
}

export function defaultFilter(): TxnFilter {
  return {
    payer: 'all',
    split: 'all',
    burden: 'all',
    categories: new Set(),
    incomeCategories: new Set(),
    assetIds: new Set(),
    amountMin: null,
    amountMax: null,
    status: 'all',
  }
}

/** True if any dimension would narrow the feed. */
export function isFilterActive(f: TxnFilter): boolean {
  return (
    f.payer !== 'all' ||
    f.split !== 'all' ||
    f.burden !== 'all' ||
    f.categories.size > 0 ||
    f.incomeCategories.size > 0 ||
    f.assetIds.size > 0 ||
    f.amountMin !== null ||
    f.amountMax !== null ||
    f.status !== 'all'
  )
}

/**
 * Normalize an amount range so an inverted pair (min > max) is swapped into a
 * valid `[min, max]` instead of producing a `BETWEEN 500 AND 100` SQL clause
 * that silently matches nothing. Mirrors the FilterSheet date range's
 * forgive-and-swap behavior — a stray tap shouldn't quietly empty the feed.
 * A `null` on either side is an open bound and is never swapped.
 */
export function normalizeAmountRange(
  min: number | null,
  max: number | null,
): { min: number | null; max: number | null } {
  if (min !== null && max !== null && min > max) {
    return { min: max, max: min }
  }
  return { min, max }
}

/**
 * Stable, order-independent signature of a filter — used as part of the
 * Records feed's React `key` so a filter change forces a clean remount that
 * re-seeds from the (already SSR-scoped) `initial`, the same way drill +
 * date-range changes do. Without this, switching e.g.「我付的」relies solely on
 * TransactionFeed's client refetch effect, which leaves the SSR-filtered
 * `initial` unused and the list out of sync (#745).
 *
 * Returns `'none'` when no dimension is active. Multi-select members are sorted
 * so equivalent filters collapse to the same key (no spurious remounts).
 */
export function filterKey(f: TxnFilter): string {
  if (!isFilterActive(f)) return 'none'
  return [
    f.payer,
    f.split,
    f.burden,
    Array.from(f.categories).sort().join('.'),
    Array.from(f.incomeCategories).sort().join('.'),
    Array.from(f.assetIds).sort().join('.'),
    f.amountMin ?? '',
    f.amountMax ?? '',
    f.status,
  ].join('|')
}

/**
 * True when an expense-only dim is active without a compensating income-side
 * dim — meaning the user is asking for a view that, by construction, contains
 * no income rows. The income query / branch short-circuits to empty in that
 * case rather than silently ignoring the filter.
 */
export function cutsIncome(f: TxnFilter): boolean {
  // Categories cuts income only when there's no income-side filter that would
  // also pick up income rows. If both are set, the user wants "expense in
  // these cats AND income in these incCats" — both kinds shown.
  const expenseOnlyCat = f.categories.size > 0 && f.incomeCategories.size === 0
  // status='pending' is cash-only: income rows are always settled and can
  // never satisfy the pending predicate, so the income branch is short-circuited.
  // burden is cash-only too: income has no split_type / paid_by-vs-recipient
  // distinction that maps to "who bears cost", so any non-'all' burden cuts income.
  return f.split !== 'all' || f.burden !== 'all' || expenseOnlyCat || f.status === 'pending'
}

/**
 * Mirror of cutsIncome — true when an income-only dim is active without a
 * compensating expense-side dim, so the cash-transaction branch returns
 * nothing. Currently the only income-only dim is `incomeCategories`.
 */
export function cutsExpense(f: TxnFilter): boolean {
  return f.incomeCategories.size > 0 && f.categories.size === 0
}

/** True if ANY transaction-only dimension is active (split or categories). Used to decide
 *  whether settlements should be hidden — settlements have no split_type / category, so
 *  applying those dims to them is meaningless and the safest UX is to hide them.
 *  The asset dimension also drops settlements (settlements have no asset).
 *  Income categories likewise force-drop settlements: a row can only "match"
 *  if the user wanted to see income, and settlements aren't income. */
export function hidesSettlements(f: TxnFilter): boolean {
  return (
    f.split !== 'all' ||
    f.burden !== 'all' ||
    f.categories.size > 0 ||
    f.incomeCategories.size > 0 ||
    f.assetIds.size > 0 ||
    // status='pending' drops settlements (they're always settled). status='settled'
    // keeps them — that's exactly the rows settlements naturally are.
    f.status === 'pending'
  )
}

/** Serialize for transport over server-action boundary (Sets aren't structured-clonable
 *  through Server Action arg serialization in some Next versions; we send arrays). */
export interface TxnFilterWire {
  payer: PayerFilter
  split: SplitFilter
  categories: CategoryId[]
  incomeCategories: IncomeCategoryId[]
  assetIds: string[]
  /** Both optional for back-compat; absent = null bound. */
  amountMin?: number | null
  amountMax?: number | null
  /** Optional for back-compat; absent = 'all'. */
  status?: StatusFilter
  /** Optional for back-compat; absent = 'all'. */
  burden?: BurdenFilter
}

export function toWire(f: TxnFilter): TxnFilterWire {
  return {
    payer: f.payer,
    split: f.split,
    categories: Array.from(f.categories),
    incomeCategories: Array.from(f.incomeCategories),
    assetIds: Array.from(f.assetIds),
    amountMin: f.amountMin,
    amountMax: f.amountMax,
    status: f.status,
    burden: f.burden,
  }
}

/**
 * Resolve a `SplitFilter` to the array of concrete DB split_types it
 * covers. `'all'` → `[]` (the query layer treats empty as "no filter").
 * Single concrete values → `[value]`. `'shared'` expands to the two
 * ratio-based modes. Single source of truth for action / page.tsx —
 * keeps the aggregate semantics from drifting between callsites.
 */
export function splitFilterToTypes(s: SplitFilter): SplitType[] {
  if (s === 'all') return []
  if (s === 'shared') return ['half', 'weighted']
  return [s]
}

export function fromWire(w: TxnFilterWire): TxnFilter {
  return {
    payer: w.payer,
    split: w.split,
    burden: w.burden ?? 'all',
    categories: new Set(w.categories),
    incomeCategories: new Set(w.incomeCategories ?? []),
    assetIds: new Set(w.assetIds ?? []),
    amountMin: w.amountMin ?? null,
    amountMax: w.amountMax ?? null,
    status: w.status ?? 'all',
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
  /** Row amount in NT$ (integer). Required for amount-range matching. */
  amount?: number
  /** Row status. Settlements are always 'settled'; transactions can be either. */
  status?: RecordStatus
}

/**
 * Returns whether a row passes the given filter.
 *
 * Note: this is the in-memory matcher used by TransactionFeed for realtime
 * cash-tx / settlement echoes. Income realtime triggers `router.refresh()`
 * (full SSR re-fetch) instead of a local mutation, so income rows never reach
 * this function — but cash transactions DO need to know about the income-side
 * filter so that realtime adds get dropped when the user's view is income-only.
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

  // 金額 dimension applies to BOTH transactions and settlements (both have
  // amount). Inclusive bounds; null on either side = open.
  if (row.amount !== undefined) {
    if (filter.amountMin !== null && row.amount < filter.amountMin) return false
    if (filter.amountMax !== null && row.amount > filter.amountMax) return false
  }

  // Settlements pass through if no transaction-only dim is active.
  // If split, categories, incomeCategories, OR assetIds filter is active,
  // settlements are dropped entirely. status='pending' also drops them
  // (settlements are always 'settled').
  if (row.kind === 'settlement') {
    return !hidesSettlements(filter)
  }

  // Income-only filter (incomeCategories without expense categories) → drop
  // every cash transaction. The user explicitly asked for income; bringing in
  // unrelated cash via realtime would surprise them.
  if (cutsExpense(filter)) return false

  // 分攤 dimension — transactions only. Concrete values match by equality;
  // 'shared' matches the two ratio-based modes (half / weighted).
  if (filter.split !== 'all') {
    const st = row.splitType
    if (filter.split === 'shared') {
      if (st !== 'half' && st !== 'weighted') return false
    } else if (st !== filter.split) {
      return false
    }
  }

  // 負擔方 dimension — transactions only. Needs viewer/payer context
  // because split_type is payer-relative. half + weighted always pass
  // (both sides bear something); the two `all_*` modes flip meaning
  // depending on who paid.
  if (filter.burden !== 'all') {
    const st = row.splitType
    if (st === 'half' || st === 'weighted') {
      // both sides bear → passes either filter direction
    } else if (filter.burden === 'mine') {
      const viewerBears =
        (row.paidBy === viewerId && st === 'all_mine') ||
        (partnerId !== null && row.paidBy === partnerId && st === 'all_theirs')
      if (!viewerBears) return false
    } else {
      // 'theirs'
      const partnerBears =
        (partnerId !== null && row.paidBy === partnerId && st === 'all_mine') ||
        (row.paidBy === viewerId && st === 'all_theirs')
      if (!partnerBears) return false
    }
  }

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

  // status dimension — only meaningful on cash transactions. When the row
  // carries a status, narrow by it; if absent (legacy callers), assume
  // 'settled' so a 'pending' filter still drops it correctly.
  if (filter.status !== 'all') {
    const rowStatus: RecordStatus = row.status ?? 'settled'
    if (rowStatus !== filter.status) return false
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
//   ?fIncCats=salary,bonus            (comma-separated IncomeCategoryIds)
//   ?fAssets=<uuid>,<uuid>,__none__   (comma-separated; sentinel for no-asset)
//   ?fAmtMin=N                        (inclusive lower bound, non-negative integer)
//   ?fAmtMax=N                        (inclusive upper bound, non-negative integer)
//   ?fStatus=pending|settled          (record status; absent = both)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD    (custom date range; both required together)
//   ?range=all                        (sentinel for "all-time"; overrides ?month)
//   ?month=YYYY-MM                    (legacy single-month scope; pre-existing)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const NON_NEG_INT_RE = /^\d+$/

function isValidPayer(s: string | null): s is PayerFilter {
  return s === 'mine' || s === 'theirs' || s === 'all'
}
function isValidSplit(s: string | null): s is SplitFilter {
  return (
    s === 'all' ||
    s === 'all_mine' ||
    s === 'all_theirs' ||
    s === 'half' ||
    s === 'weighted' ||
    s === 'shared'
  )
}
function isValidBurden(s: string | null): s is BurdenFilter {
  return s === 'all' || s === 'mine' || s === 'theirs'
}
function isValidStatus(s: string | null): s is StatusFilter {
  return s === 'all' || s === 'pending' || s === 'settled'
}
function isValidAssetMember(s: string): boolean {
  return s === ASSET_FILTER_NONE || UUID_RE.test(s)
}
/**
 * Parse a non-negative integer amount from URL. Returns null on absent or
 * malformed input — keeps the "tampered URL = no filter on that dim, never
 * throw" contract. Decimal / negative / non-numeric all fall through.
 */
function parseAmountParam(s: string | null): number | null {
  if (s === null) return null
  const trimmed = s.trim()
  if (trimmed === '' || !NON_NEG_INT_RE.test(trimmed)) return null
  const n = Number(trimmed)
  // Number.isFinite guards against the (impossibly long) overflow case.
  if (!Number.isFinite(n)) return null
  return n
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

  const burden = params.get('fBurden')
  if (burden && isValidBurden(burden) && burden !== 'all') f.burden = burden

  const cats = params.get('fCats')
  if (cats) {
    for (const id of cats.split(',')) {
      const trimmed = id.trim()
      if (trimmed && isValidCategoryId(trimmed) && trimmed !== 'settle') {
        f.categories.add(trimmed as CategoryId)
      }
    }
  }

  const incCats = params.get('fIncCats')
  if (incCats) {
    for (const id of incCats.split(',')) {
      const trimmed = id.trim()
      if (trimmed && isValidIncomeCategoryId(trimmed)) {
        f.incomeCategories.add(trimmed as IncomeCategoryId)
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

  f.amountMin = parseAmountParam(params.get('fAmtMin'))
  f.amountMax = parseAmountParam(params.get('fAmtMax'))

  const status = params.get('fStatus')
  if (status && isValidStatus(status) && status !== 'all') f.status = status

  return f
}

/** Plain-record variant for Next.js server-component searchParams. */
export function parseFilterFromRecord(rec: {
  fPayer?: string
  fSplit?: string
  fBurden?: string
  fCats?: string
  fIncCats?: string
  fAssets?: string
  fAmtMin?: string
  fAmtMax?: string
  fStatus?: string
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

  if (f.burden !== 'all') params.set('fBurden', f.burden)
  else params.delete('fBurden')

  if (f.categories.size > 0) params.set('fCats', Array.from(f.categories).sort().join(','))
  else params.delete('fCats')

  if (f.incomeCategories.size > 0)
    params.set('fIncCats', Array.from(f.incomeCategories).sort().join(','))
  else params.delete('fIncCats')

  if (f.assetIds.size > 0) params.set('fAssets', Array.from(f.assetIds).sort().join(','))
  else params.delete('fAssets')

  if (f.amountMin !== null) params.set('fAmtMin', String(f.amountMin))
  else params.delete('fAmtMin')

  if (f.amountMax !== null) params.set('fAmtMax', String(f.amountMax))
  else params.delete('fAmtMax')

  if (f.status !== 'all') params.set('fStatus', f.status)
  else params.delete('fStatus')
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
