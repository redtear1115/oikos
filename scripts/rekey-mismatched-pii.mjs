#!/usr/bin/env node
/**
 * #881 — Repair PII rows encrypted with the WRONG key.
 *
 * Root cause: the original PII backfill (`encrypt-existing-pii.mjs`) was run
 * against an environment using a different `ENCRYPTION_KEY` than that
 * environment's runtime. The backfilled columns (`CarDetails.plate_encrypted`,
 * `HouseDetails.address_encrypted`) ended up encrypted with the wrong key, so
 * the app's `decrypt()` (which uses the runtime key) fails with
 * "Unsupported state or unable to authenticate data". Columns written through
 * the normal app path (child name / national-id / NHI) used the runtime key
 * and are fine.
 *
 * This script re-keys every encrypted PII column: for each non-null value it
 * tries the NEW (runtime) key first — if that succeeds the row is already
 * correct and is skipped — otherwise it decrypts with the OLD key and
 * re-encrypts with the NEW key. Rows that decrypt with NEITHER key are
 * reported as unrecoverable and left untouched.
 *
 * Algorithm + format match `lib/crypto.ts` byte-for-byte (AES-256-GCM,
 * `iv:authTag:ciphertext` hex), so re-keyed values decrypt via the app.
 *
 * IDEMPOTENT: re-running after a successful pass is a no-op (every row now
 * decrypts with NEW → skipped). Safe to run repeatedly.
 *
 * Usage:
 *   # Dry-run first (no writes — reports the rekey / skip / unrecoverable plan):
 *   DRY_RUN=1 \
 *   OLD_ENCRYPTION_KEY=<64 hex, the key the bad backfill used> \
 *   NEW_ENCRYPTION_KEY=<64 hex, the target env's runtime key> \
 *   node --env-file=.env.<target> scripts/rekey-mismatched-pii.mjs
 *
 *   # Apply:
 *   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... \
 *   node --env-file=.env.<target> scripts/rekey-mismatched-pii.mjs
 *
 * Required env:
 *   DATABASE_URL          target DB (e.g. pulled via `vercel env pull`)
 *   OLD_ENCRYPTION_KEY    64 hex chars — the wrong key the data is under now
 *   NEW_ENCRYPTION_KEY    64 hex chars — the runtime key the app decrypts with
 *
 * Per CLAUDE.md the dev and prod Supabase projects are independent. Point
 * DATABASE_URL + NEW_ENCRYPTION_KEY at whichever environment is broken.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import postgres from 'postgres'

const DRY_RUN = process.env.DRY_RUN === '1'
const POSTGRES_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL
const OLD_KEY_HEX = process.env.OLD_ENCRYPTION_KEY
const NEW_KEY_HEX = process.env.NEW_ENCRYPTION_KEY

if (!POSTGRES_URL) {
  console.error('DATABASE_URL missing — load it with --env-file or export it.')
  process.exit(1)
}
for (const [name, val] of [['OLD_ENCRYPTION_KEY', OLD_KEY_HEX], ['NEW_ENCRYPTION_KEY', NEW_KEY_HEX]]) {
  if (!val || !/^[0-9a-fA-F]{64}$/.test(val)) {
    console.error(`${name} must be 64 hex chars (32 bytes)`)
    process.exit(1)
  }
}
const OLD_KEY = Buffer.from(OLD_KEY_HEX, 'hex')
const NEW_KEY = Buffer.from(NEW_KEY_HEX, 'hex')

if (OLD_KEY.equals(NEW_KEY)) {
  console.error('OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are identical — nothing to re-key.')
  process.exit(1)
}

function decryptWith(key, ciphertext) {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, authTagHex, encryptedHex] = parts
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(encryptedHex, 'hex')).toString('utf8') + decipher.final('utf8')
}

function encryptWith(key, plaintext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

const sql = postgres(POSTGRES_URL, { max: 1, prepare: false })

// Each target: a logical column, its table, its PK column, and the encrypted
// column. `pk` is the row identifier we update by.
const TARGETS = [
  { label: 'name',      table: 'Assets',       pk: 'id',       col: 'name_encrypted' },
  { label: 'plate',     table: 'CarDetails',   pk: 'asset_id', col: 'plate_encrypted' },
  { label: 'address',   table: 'HouseDetails', pk: 'asset_id', col: 'address_encrypted' },
  { label: 'id_number', table: 'ChildDetails', pk: 'asset_id', col: 'id_number_encrypted' },
  { label: 'nhi',       table: 'ChildDetails', pk: 'asset_id', col: 'insurance_id_encrypted' },
]

async function rekeyTarget(t) {
  const rows = await sql`
    SELECT ${sql(t.pk)} AS pk, ${sql(t.col)} AS ct
    FROM ${sql(t.table)}
    WHERE ${sql(t.col)} IS NOT NULL
  `
  let already = 0, rekeyed = 0, broken = 0
  for (const row of rows) {
    // Already on the NEW key → leave it (idempotent).
    try { decryptWith(NEW_KEY, row.ct); already++; continue } catch { /* not new-key */ }
    // Recoverable with the OLD key → re-encrypt under NEW.
    let plaintext
    try { plaintext = decryptWith(OLD_KEY, row.ct) }
    catch {
      broken++
      console.warn(`  [${t.label}] UNRECOVERABLE (neither key) pk=${row.pk}`)
      continue
    }
    rekeyed++
    if (!DRY_RUN) {
      const next = encryptWith(NEW_KEY, plaintext)
      await sql`UPDATE ${sql(t.table)} SET ${sql(t.col)} = ${next} WHERE ${sql(t.pk)} = ${row.pk}`
    }
  }
  console.log(
    `[${t.label}] total=${rows.length} ok=${already} rekey=${rekeyed} broken=${broken}` +
    (DRY_RUN ? ' (dry run, no writes)' : ''),
  )
  return { rekeyed, broken }
}

try {
  let totalRekey = 0, totalBroken = 0
  for (const t of TARGETS) {
    const { rekeyed, broken } = await rekeyTarget(t)
    totalRekey += rekeyed
    totalBroken += broken
  }
  console.log(`\nDone. rekeyed=${totalRekey} unrecoverable=${totalBroken}${DRY_RUN ? ' (dry run, no writes)' : ''}`)
  if (totalBroken > 0) {
    console.error('Some rows decrypt with NEITHER key — they need manual recovery (e.g. PITR or re-entry).')
    process.exitCode = 2
  }
} catch (err) {
  console.error('Re-key failed:', err)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
