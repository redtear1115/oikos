import { NextResponse } from 'next/server'
import { createDecipheriv, timingSafeEqual } from 'crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { assets, carDetails, houseDetails, childDetails } from '@/lib/db/schema'
import { encrypt } from '@/lib/crypto'

/**
 * #881 — ONE-OFF in-runtime PII re-key endpoint.
 *
 * Why this exists: the original PII backfill encrypted CarDetails.plate +
 * HouseDetails.address under the WRONG key (the dev ENCRYPTION_KEY), so prod
 * can't decrypt them. Prod's real key is a Vercel "Sensitive" var — it can't
 * be pulled out, so the re-key must run INSIDE a deployment that has it.
 * A preview deployment connects to the same prod DB and (when ENCRYPTION_KEY
 * is set for all environments) carries the same key, so this can run from a
 * preview URL without a prod release and without the key ever being logged.
 *
 * `encrypt()` (lib/crypto) uses the runtime key = NEW key. The OLD (wrong) key
 * is passed in the request body — it's the dev key, low-sensitivity. Each value
 * is decrypted with OLD and re-encrypted with NEW (runtime). Idempotent: rows
 * already on the runtime key are detected by the pre-flight and skipped.
 *
 * Guards:
 *  - Disabled unless REKEY_ADMIN_TOKEN is set AND the x-rekey-token header matches.
 *  - Pre-flight: the runtime key MUST decrypt an existing app-written value
 *    (a child name / id / nhi row). This proves runtime key == the key that
 *    correct data is already on (i.e. the real prod key). If it can't, we abort
 *    WITHOUT writing — protects against running on a deployment whose key differs.
 *  - dryRun defaults to true; must pass {"dryRun": false} to actually write.
 *
 * REMOVE this route in a follow-up PR once the re-key has run.
 *
 * POST /api/admin/rekey-pii
 *   headers: x-rekey-token: <REKEY_ADMIN_TOKEN>
 *   body: { "oldKey": "<64 hex>", "dryRun": true|false }
 */

export const dynamic = 'force-dynamic'

function decryptWith(keyHex: string, ciphertext: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(encryptedHex, 'hex')).toString('utf8') + decipher.final('utf8')
}

// Re-encrypt a single value: decrypt with OLD, encrypt with runtime (NEW) key.
function rekeyValue(oldKeyHex: string, ciphertext: string): string {
  const plaintext = decryptWith(oldKeyHex, ciphertext)
  return encrypt(plaintext)
}

// Does the runtime key decrypt this value? (encrypt() uses runtime key; mirror
// its key for a decrypt probe via a round-trip-independent check.)
function runtimeKeyDecrypts(ciphertext: string): boolean {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) return false
  try {
    decryptWith(keyHex, ciphertext)
    return true
  } catch {
    return false
  }
}

function tokenOk(header: string | null): boolean {
  const expected = process.env.REKEY_ADMIN_TOKEN
  if (!expected || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

interface Target {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any
  pkCol: string
  encCol: string
}

const TARGETS: Target[] = [
  { label: 'name', table: assets, pkCol: 'id', encCol: 'nameEncrypted' },
  { label: 'plate', table: carDetails, pkCol: 'assetId', encCol: 'plateEncrypted' },
  { label: 'address', table: houseDetails, pkCol: 'assetId', encCol: 'addressEncrypted' },
  { label: 'id_number', table: childDetails, pkCol: 'assetId', encCol: 'idNumberEncrypted' },
  { label: 'nhi', table: childDetails, pkCol: 'assetId', encCol: 'insuranceIdEncrypted' },
]

export async function POST(request: Request) {
  if (!tokenOk(request.headers.get('x-rekey-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!process.env.ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'no_runtime_key' }, { status: 500 })
  }

  let body: { oldKey?: string; dryRun?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }
  const oldKey = body.oldKey
  if (!oldKey || !/^[0-9a-fA-F]{64}$/.test(oldKey)) {
    return NextResponse.json({ error: 'oldKey must be 64 hex chars' }, { status: 400 })
  }
  // Default to dry-run; require explicit dryRun:false to write.
  const dryRun = body.dryRun !== false

  // Pull every encrypted value (raw SQL keeps it simple + column-name driven).
  const allRows = await db.execute<{ col: string; pk: string; ct: string }>(sql`
    SELECT 'name' AS col, id::text AS pk, name_encrypted AS ct FROM "Assets" WHERE name_encrypted IS NOT NULL
    UNION ALL SELECT 'plate', asset_id::text, plate_encrypted FROM "CarDetails" WHERE plate_encrypted IS NOT NULL
    UNION ALL SELECT 'address', asset_id::text, address_encrypted FROM "HouseDetails" WHERE address_encrypted IS NOT NULL
    UNION ALL SELECT 'id_number', asset_id::text, id_number_encrypted FROM "ChildDetails" WHERE id_number_encrypted IS NOT NULL
    UNION ALL SELECT 'nhi', asset_id::text, insurance_id_encrypted FROM "ChildDetails" WHERE insurance_id_encrypted IS NOT NULL
  `)

  // Pre-flight safety: the runtime key MUST decrypt at least one app-written
  // value (name/id_number/nhi). That proves runtime key == the key correct data
  // already uses (the real prod key). If not, refuse to touch anything.
  const appWritten = allRows.filter(r => r.col === 'name' || r.col === 'id_number' || r.col === 'nhi')
  const probe = appWritten.find(r => runtimeKeyDecrypts(r.ct))
  if (!probe) {
    return NextResponse.json({
      error: 'preflight_failed',
      detail: 'Runtime ENCRYPTION_KEY does not decrypt any app-written PII row — this deployment is NOT on the prod key. Aborting without writes.',
      appWrittenRowsSeen: appWritten.length,
    }, { status: 409 })
  }

  // Plan + (optionally) apply the re-key, column by column.
  const summary: Record<string, { total: number; ok: number; rekey: number; broken: number }> = {}
  const brokenRows: { col: string; pk: string }[] = []

  for (const t of TARGETS) {
    const colRows = allRows.filter(r => r.col === t.label)
    let ok = 0, rekey = 0, broken = 0
    for (const r of colRows) {
      if (runtimeKeyDecrypts(r.ct)) { ok++; continue }   // already on NEW key
      let next: string
      try {
        next = rekeyValue(oldKey, r.ct)                   // OLD → NEW
      } catch {
        broken++
        brokenRows.push({ col: t.label, pk: r.pk })
        continue
      }
      rekey++
      if (!dryRun) {
        await db
          .update(t.table)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({ [t.encCol]: next } as any)
          .where(eq(t.table[t.pkCol], r.pk))
      }
    }
    summary[t.label] = { total: colRows.length, ok, rekey, broken }
  }

  const totalRekey = Object.values(summary).reduce((n, s) => n + s.rekey, 0)
  const totalBroken = brokenRows.length
  return NextResponse.json({
    dryRun,
    summary,
    totalRekey,
    totalBroken,
    brokenRows,
    note: dryRun
      ? 'DRY RUN — no writes. Re-send with {"dryRun": false} to apply.'
      : 'Applied. Re-running is safe (idempotent).',
  })
}
