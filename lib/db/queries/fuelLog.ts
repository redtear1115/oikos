import { db } from '@/lib/db/client'
import { fuelLogs } from '@/lib/db/schema'
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { type EpochWindow } from './epoch'
import type { FuelType } from '@/lib/fuel'
import { computeOverallEcon } from '@/lib/fuelEcon'

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
 * loggedAt desc.
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
    .orderBy(desc(fuelLogs.loggedAt))
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
 *   avgFuelEcon: chapter-scoped overall km/L, computed by
 *     `computeOverallEcon` in `lib/fuelEcon.ts` — this function does no econ
 *     math of its own (#1089). Returns null when fewer than 2 logs exist
 *     within the chapter.
 *
 * ⚠️ This is NOT the same average the asset detail page shows. The detail page
 * calls `computeAvgEcon`, which averages per-fill ratios over the last 180 days
 * per `car-fuellog-design.md` Q12; `computeOverallEcon` has no time window and
 * weights by liters. Same car, two numbers. Both now live in `lib/fuelEcon.ts`
 * so the gap is visible in one file instead of split across two — reconciling
 * them is a product decision, tracked separately.
 *
 * Done in JS off listFuelLogsForAsset to keep the SQL trivially auditable;
 * N is small (a handful of fill-ups per car for the foreseeable future).
 *
 * Chapter-scope: takes an `epochWindow` and threads it through to
 * `listFuelLogsForAsset`, so a pinned past chapter's stats reflect only the
 * fills that happened in that chapter. Note this means "the earliest log" whose
 * liters get excluded is the earliest *within the chapter*, not all-time.
 */
export async function getCarHeroStats(
  assetId: string,
  initialOdometer: number | null,
  epochWindow: EpochWindow,
): Promise<{ latestOdometer: number | null; avgFuelEcon: number | null; lastFuelDate: Date | null }> {
  const logs = await listFuelLogsForAsset(assetId, epochWindow)  // desc by loggedAt
  if (logs.length === 0) {
    return { latestOdometer: initialOdometer, avgFuelEcon: null, lastFuelDate: null }
  }
  const latestOdometer = logs[0].odometer
  const lastFuelDate = logs[0].loggedAt
  return { latestOdometer, avgFuelEcon: computeOverallEcon(logs), lastFuelDate }
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
