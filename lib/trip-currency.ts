// Trip-scoped currency snapshot. Stored on Trips.rate_snapshot (jsonb).
//
// Each trip picks 1–5 currencies (free-text codes — TWD/JPY/USD/CNY plus any
// user-defined like VND, EUR), assigns a "心理匯率" relative to one chosen
// default. Snapshot is frozen at trip creation: later edits don't drift the
// stored amount of past TripExpenses.
//
// Rate semantics: 1 display unit of `entry.code` = `entry.rate` display units
// of `default`. The default entry itself has rate = 1.
//
// Why a snapshot (not a live table): the original tag-style design used a
// per-group CurrencyRates table (now deprecated #410). Trip-scoped jsonb keeps
// the data colocated with the trip, easier to migrate when shape evolves, and
// avoids a JOIN on every trip read. See docs/superpowers/specs/trip-multi-currency-design.md.

export interface TripCurrencyEntry {
  code: string                 // free-text, uppercase by convention (e.g. "TWD", "VND")
  label?: string | null        // optional user display label
  rate: number                 // 1 unit of code = rate units of default. default itself = 1.
}

export interface TripCurrencySnapshot {
  default: string              // must equal one entry.code
  entries: TripCurrencyEntry[] // 1–5 entries; first match wins on duplicates
}

/**
 * Parse a raw value (from drizzle jsonb column) into a typed snapshot.
 *
 * Accepts both:
 *   - New shape: `{ default, entries[] }`
 *   - Legacy shape: `{ FROM_TO: number, ... }` — reconstructed using `fallbackDefault`
 *     (typically the trip's `default_currency` column or the group's base currency).
 *
 * Migration 0040 converts all existing rows to the new shape; this fallback is
 * a belt-and-braces safety net for any row that escapes migration (e.g. tests).
 */
export function parseTripCurrencySnapshot(
  raw: unknown,
  fallbackDefault: string,
): TripCurrencySnapshot {
  const def = (fallbackDefault || 'TWD').toUpperCase()

  if (raw == null || typeof raw !== 'object') {
    return { default: def, entries: [{ code: def, label: null, rate: 1 }] }
  }

  const obj = raw as Record<string, unknown>

  // New shape detection.
  if (typeof obj.default === 'string' && Array.isArray(obj.entries)) {
    const entries: TripCurrencyEntry[] = []
    for (const e of obj.entries) {
      if (!e || typeof e !== 'object') continue
      const entry = e as Record<string, unknown>
      const code = typeof entry.code === 'string' ? entry.code.toUpperCase() : null
      const rate = typeof entry.rate === 'number'
        ? entry.rate
        : typeof entry.rate === 'string'
          ? parseFloat(entry.rate)
          : NaN
      if (!code || !Number.isFinite(rate) || rate <= 0) continue
      entries.push({
        code,
        label: typeof entry.label === 'string' ? entry.label : null,
        rate,
      })
    }
    if (entries.length === 0) {
      entries.push({ code: def, label: null, rate: 1 })
    }
    const defStr = obj.default.toUpperCase()
    const resolvedDefault = entries.find(e => e.code === defStr)
      ? defStr
      : entries[0].code
    return { default: resolvedDefault, entries }
  }

  // Legacy shape `{ "FROM_TO": rate, ... }` — reconstruct.
  const entries: TripCurrencyEntry[] = [{ code: def, label: null, rate: 1 }]
  const seen = new Set<string>([def])
  for (const [key, value] of Object.entries(obj)) {
    const m = /^([A-Za-z]{2,8})_([A-Za-z]{2,8})$/.exec(key)
    if (!m) continue
    const from = m[1].toUpperCase()
    const to = m[2].toUpperCase()
    const rateNum = typeof value === 'number' ? value : parseFloat(String(value))
    if (!Number.isFinite(rateNum) || rateNum <= 0) continue
    if (to === def && from !== def && !seen.has(from)) {
      entries.push({ code: from, label: null, rate: rateNum })
      seen.add(from)
    }
  }
  return { default: def, entries }
}

/**
 * Look up the rate for converting `code` → `snapshot.default`. Returns null if
 * the code is not in the snapshot.
 */
export function findRate(snapshot: TripCurrencySnapshot, code: string): number | null {
  const target = code.toUpperCase()
  const entry = snapshot.entries.find(e => e.code === target)
  return entry ? entry.rate : null
}

/**
 * Build a fresh snapshot from a list of (groupId, from, to, rate) rows pulled
 * from the legacy CurrencyRates table. Used by createTrip during the transition
 * — once TripSheet captures explicit currencies, this fallback path goes away.
 */
export function buildSnapshotFromCurrencyRates(
  rates: Array<{ fromCurrency: string; toCurrency: string; rate: string | number }>,
  defaultCode: string,
): TripCurrencySnapshot {
  const def = defaultCode.toUpperCase()
  const entries: TripCurrencyEntry[] = [{ code: def, label: null, rate: 1 }]
  const seen = new Set<string>([def])
  for (const r of rates) {
    const from = r.fromCurrency.toUpperCase()
    const to = r.toCurrency.toUpperCase()
    const rateNum = typeof r.rate === 'number' ? r.rate : parseFloat(r.rate)
    if (!Number.isFinite(rateNum) || rateNum <= 0) continue
    if (to === def && from !== def && !seen.has(from)) {
      entries.push({ code: from, label: null, rate: rateNum })
      seen.add(from)
    }
  }
  return { default: def, entries }
}

/**
 * Sanitize + validate a snapshot received from the client. Throws on invalid
 * input. Codes are uppercased and trimmed; labels are trimmed (empty → null).
 */
export function validateTripCurrencySnapshot(input: unknown): TripCurrencySnapshot {
  if (!input || typeof input !== 'object') throw new Error('幣別資料缺失')
  const obj = input as Record<string, unknown>
  if (typeof obj.default !== 'string' || !obj.default.trim()) {
    throw new Error('預設幣別未指定')
  }
  if (!Array.isArray(obj.entries)) throw new Error('幣別列表缺失')

  const defaultCode = obj.default.trim().toUpperCase()
  if (defaultCode.length > 16) throw new Error('幣別代碼過長')

  const entries: TripCurrencyEntry[] = []
  const seenCodes = new Set<string>()

  for (const raw of obj.entries) {
    if (!raw || typeof raw !== 'object') throw new Error('幣別項目格式錯誤')
    const e = raw as Record<string, unknown>
    if (typeof e.code !== 'string' || !e.code.trim()) throw new Error('幣別代碼為空')
    const code = e.code.trim().toUpperCase()
    if (code.length > 16) throw new Error(`幣別代碼過長: ${code}`)
    if (seenCodes.has(code)) throw new Error(`重複的幣別: ${code}`)

    const rateRaw = e.rate
    const rate = typeof rateRaw === 'number'
      ? rateRaw
      : typeof rateRaw === 'string'
        ? parseFloat(rateRaw)
        : NaN
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`匯率必須是正數: ${code}`)

    const labelRaw = typeof e.label === 'string' ? e.label.trim() : ''
    entries.push({ code, label: labelRaw || null, rate })
    seenCodes.add(code)
  }

  if (entries.length < 1) throw new Error('至少需要一個幣別')
  if (entries.length > 5) throw new Error('最多 5 個幣別')
  if (!seenCodes.has(defaultCode)) throw new Error('預設幣別不在列表中')

  // Force default entry's rate to exactly 1.
  for (const entry of entries) {
    if (entry.code === defaultCode) entry.rate = 1
  }

  return { default: defaultCode, entries }
}
