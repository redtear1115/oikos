import { db } from '@/lib/db/client'
import { fuelLogs } from '@/lib/db/schema'
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { type EpochWindow } from './epoch'
import type { FuelType } from '@/lib/fuel'
import { computeAvgEcon } from '@/lib/fuelEcon'

export interface FuelLogRow {
  id: string
  assetId: string
  liters: string  // Drizzle numeric returns string; caller parses
  fuelType: FuelType
  odometer: number
  station: string | null
  loggedAt: Date
  createdAt: Date
}

/**
 * List active fuel logs for an asset within the given epoch window, sorted by
 * `logged_at DESC, created_at DESC`.
 *
 * The `created_at` tie-break is required, not cosmetic: two fills on the same
 * day are otherwise returned in whatever order Postgres feels like, and callers
 * that treat `rows[0]` as "the latest fill" or drop the earliest row's liters
 * (`computeAvgEcon`) then get a number that changes between identical requests
 * with no error anywhere. Matches `listFuelLogsWithPrev` below exactly — the two
 * must agree or the detail page and the hero card disagree again (#1095).
 *
 * `created_at` here is an *ordering* key ("which of the two was written down
 * first"), not the chapter predicate — that is the separate `epochWindow`
 * filter on the same column below.
 *
 * Chapter-scope: filters by `created_at` against `epochWindow` so that pinning
 * a past chapter shows only the fills logged during that chapter.
 */
export async function listFuelLogsForAsset(
  assetId: string,
  epochWindow: EpochWindow,
): Promise<FuelLogRow[]> {
  const conditions = [
    eq(fuelLogs.assetId, assetId),
    isNull(fuelLogs.deletedAt),
    gte(fuelLogs.createdAt, epochWindow.startedAt),
    ...(epochWindow.endedAt ? [lt(fuelLogs.createdAt, epochWindow.endedAt)] : []),
  ]
  const rows = await db
    .select()
    .from(fuelLogs)
    .where(and(...conditions))
    .orderBy(desc(fuelLogs.loggedAt), desc(fuelLogs.createdAt))
  return rows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    liters: r.liters,
    fuelType: r.fuelType,
    odometer: r.odometer,
    station: r.station,
    loggedAt: r.loggedAt,
    createdAt: r.createdAt,
  }))
}

/**
 * Same as listFuelLogsForAsset but each row includes prevOdometer (for FuelRow
 * km/L badge computation). Uses LAG window function ordered by loggedAt asc so
 * each row's prevOdometer = the immediately preceding (older) fill-up's odometer.
 */
export interface FuelLogWithPrev extends FuelLogRow {
  prevOdometer: number | null
}

export async function listFuelLogsWithPrev(
  assetId: string,
  epochWindow: EpochWindow,
): Promise<FuelLogWithPrev[]> {
  // Chapter-scope: WHERE filters by `created_at` against the epoch window
  // BEFORE LAG runs, so the first fill in a pinned chapter naturally has
  // prev_odometer = NULL (accepted trade-off — the km/L badge for that row
  // will be blank rather than reaching back into a previous chapter).
  const upperBound = epochWindow.endedAt
    ? sql`AND created_at < ${epochWindow.endedAt.toISOString()}::timestamptz`
    : sql``
  const rows = await db.execute<{
    id: string
    asset_id: string
    liters: string
    fuel_type: FuelType
    odometer: number
    station: string | null
    logged_at: Date | string
    created_at: Date | string
    prev_odometer: number | null
  }>(sql`
    SELECT
      id, asset_id, liters, fuel_type, odometer, station,
      logged_at, created_at,
      LAG(odometer) OVER (ORDER BY logged_at ASC, created_at ASC) AS prev_odometer
    FROM "FuelLogs"
    WHERE asset_id = ${assetId}
      AND deleted_at IS NULL
      AND created_at >= ${epochWindow.startedAt.toISOString()}::timestamptz
      ${upperBound}
    ORDER BY logged_at DESC, created_at DESC
  `)

  return rows.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    liters: r.liters,
    fuelType: r.fuel_type,
    odometer: r.odometer,
    station: r.station,
    // db.execute() returns timestamps as strings (postgres-js default), unlike
    // Drizzle's typed select which yields Date — coerce here so callers get a
    // uniform Date contract.
    loggedAt: r.logged_at instanceof Date ? r.logged_at : new Date(r.logged_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    prevOdometer: r.prev_odometer,
  }))
}

/**
 * Hero card stats for a car asset on the assets list.
 *   latestOdometer: newest fuel log's odometer; falls back to initialOdometer
 *     when there are zero logs (still null if both unset).
 *   avgFuelEcon: distance-weighted km/L over the last 180 days, computed by
 *     `computeAvgEcon` in `lib/fuelEcon.ts` — this function does no econ math
 *     of its own (#1089). Returns null when fewer than 2 logs fall inside that
 *     window.
 *
 * This is the same function, and therefore the same number, the asset detail
 * page shows (#1095). Before that the hero card used an unwindowed ratio of
 * totals and the detail page a 180-day mean of per-fill ratios, so one car
 * reported two averages.
 *
 * Note the asymmetry: `latestOdometer` / `lastFuelDate` stay chapter-scoped and
 * unwindowed (they describe the car, not recent economy), while `avgFuelEcon`
 * is additionally narrowed to 180 days. A car parked for half a year keeps its
 * odometer and last-fuel date but has no average — intended, see #1095.
 *
 * Done in JS off listFuelLogsForAsset to keep the SQL trivially auditable;
 * N is small (a handful of fill-ups per car for the foreseeable future).
 *
 * Chapter-scope: takes an `epochWindow` and threads it through to
 * `listFuelLogsForAsset`, so a pinned past chapter's stats reflect only the
 * fills that happened in that chapter. Combined with the 180-day window, "the
 * earliest log" whose liters get excluded is the earliest fill that is both in
 * the chapter and inside the window — not all-time.
 */
export async function getCarHeroStats(
  assetId: string,
  initialOdometer: number | null,
  epochWindow: EpochWindow,
): Promise<{ latestOdometer: number | null; avgFuelEcon: number | null; lastFuelDate: Date | null }> {
  const logs = await listFuelLogsForAsset(assetId, epochWindow)  // desc by loggedAt, createdAt
  if (logs.length === 0) {
    return { latestOdometer: initialOdometer, avgFuelEcon: null, lastFuelDate: null }
  }
  const latestOdometer = logs[0].odometer
  const lastFuelDate = logs[0].loggedAt
  return { latestOdometer, avgFuelEcon: computeAvgEcon(logs), lastFuelDate }
}

/**
 * Sum of CashTransactions linked to this asset's fuel logs (本月加油 / 累計加油).
 * Month boundary uses Asia/Taipei (TW-only product) for consistency with
 * getAssetSummary in asset.ts. Returns 0 when no fuel transactions exist.
 *
 * Chapter-scope: filters by `created_at` against `epochWindow`. When pinned
 * to a past chapter, `totalFuel` reflects only that chapter's fuel spend
 * (label「累計加油」may want copy revisited; tracked as follow-up).
 */
export async function fuelStatsForAsset(
  assetId: string,
  epochWindow: EpochWindow,
): Promise<{
  monthFuel: number
  totalFuel: number
}> {
  const upperBound = epochWindow.endedAt
    ? sql`AND created_at < ${epochWindow.endedAt.toISOString()}::timestamptz`
    : sql``
  const rows = await db.execute<{ month_fuel: number | null; total_fuel: number | null }>(sql`
    SELECT
      COALESCE(SUM(amount) FILTER (
        WHERE date_trunc('month', (transacted_at AT TIME ZONE 'Asia/Taipei')::timestamp)
            = date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei')::timestamp)
      ), 0)::int AS month_fuel,
      COALESCE(SUM(amount), 0)::int AS total_fuel
    FROM "CashTransactions"
    WHERE asset_id = ${assetId}
      AND fuel_log_id IS NOT NULL
      AND deleted_at IS NULL
      AND created_at >= ${epochWindow.startedAt.toISOString()}::timestamptz
      ${upperBound}
  `)
  const r = rows[0] ?? { month_fuel: 0, total_fuel: 0 }
  return { monthFuel: r.month_fuel ?? 0, totalFuel: r.total_fuel ?? 0 }
}
