#!/usr/bin/env node
/**
 * One-shot backfill for #826: encrypts the legacy `CarDetails.plate` and
 * `HouseDetails.address` plain-text values into the new `*_encrypted`
 * columns. Idempotent — only touches rows where the encrypted column is
 * still NULL, so re-running on the same DB is a no-op.
 *
 * Algorithm + format match `lib/crypto.ts` byte-for-byte (AES-256-GCM,
 * `iv:authTag:ciphertext` hex), so values written here decrypt via the
 * normal app `decrypt()` path.
 *
 * Usage:
 *   node --env-file=.env.local scripts/encrypt-existing-pii.mjs
 *
 *   # Dry-run (counts rows, no writes):
 *   DRY_RUN=1 node --env-file=.env.local scripts/encrypt-existing-pii.mjs
 *
 * Required env (.env.local):
 *   DATABASE_URL=...               (project convention; pooler URL is fine)
 *   ENCRYPTION_KEY=<64 hex chars>  (32-byte key; same one the app uses)
 *
 * `POSTGRES_URL` is accepted as a fallback name for symmetry with other
 * Supabase tooling, but the project standard is `DATABASE_URL` (matches
 * `lib/db/client.ts` and `.env.local.example`).
 *
 * Per CLAUDE.md the dev and prod Supabase projects are independent; run
 * once against dev, then again against prod with that project's
 * connection string + matching ENCRYPTION_KEY.
 */

import { createCipheriv, randomBytes } from 'node:crypto'
import postgres from 'postgres'

const DRY_RUN = process.env.DRY_RUN === '1'
const POSTGRES_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

if (!POSTGRES_URL) {
  console.error('DATABASE_URL missing — load .env.local with --env-file=.env.local (or export it). POSTGRES_URL also accepted as a fallback name.')
  process.exit(1)
}
if (!ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  console.error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  process.exit(1)
}
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex')

function encrypt(plaintext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

const sql = postgres(POSTGRES_URL, { max: 1, prepare: false })

async function backfillPlate() {
  const rows = await sql`
    SELECT asset_id, plate
    FROM "CarDetails"
    WHERE plate_encrypted IS NULL
      AND plate <> ''
  `
  console.log(`[plate] ${rows.length} row(s) need backfill${DRY_RUN ? ' (dry run)' : ''}`)
  if (DRY_RUN || rows.length === 0) return rows.length
  for (const row of rows) {
    const ciphertext = encrypt(row.plate)
    await sql`
      UPDATE "CarDetails"
      SET plate_encrypted = ${ciphertext}
      WHERE asset_id = ${row.asset_id}
    `
  }
  console.log(`[plate] ${rows.length} row(s) updated`)
  return rows.length
}

async function backfillAddress() {
  const rows = await sql`
    SELECT asset_id, address
    FROM "HouseDetails"
    WHERE address_encrypted IS NULL
      AND address IS NOT NULL
      AND address <> ''
  `
  console.log(`[address] ${rows.length} row(s) need backfill${DRY_RUN ? ' (dry run)' : ''}`)
  if (DRY_RUN || rows.length === 0) return rows.length
  for (const row of rows) {
    const ciphertext = encrypt(row.address)
    await sql`
      UPDATE "HouseDetails"
      SET address_encrypted = ${ciphertext}
      WHERE asset_id = ${row.asset_id}
    `
  }
  console.log(`[address] ${rows.length} row(s) updated`)
  return rows.length
}

try {
  const plateCount = await backfillPlate()
  const addressCount = await backfillAddress()
  console.log(`Done. plate=${plateCount} address=${addressCount}${DRY_RUN ? ' (dry run, no writes)' : ''}`)
} catch (err) {
  console.error('Backfill failed:', err)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
