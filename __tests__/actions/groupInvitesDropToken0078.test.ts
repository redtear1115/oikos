import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql, TransactionSql } from 'postgres'
import { loadEnvLocal } from '../outing/_setup'

// ─── 0078: drop the plaintext GroupInvites.token column (#1288 I3d) ───────
//
// LOCAL THROWAWAY DATABASE ONLY. Every case runs inside a transaction that is
// rolled back, but it takes an ACCESS EXCLUSIVE lock on the real
// "GroupInvites" table while it runs, so run this file on its own. It skips
// itself unless DATABASE_URL points at localhost — never run it against dev or
// prod.
//
// Database: postgres:17 plus the Supabase stand-ins (see PR #1445's
// description), then `drizzle-kit migrate`. Either state works:
//   - migrated through 0077 (the real pre-0078 table), or
//   - migrated through 0078: each case first puts the 0077 shape back inside
//     its transaction (`toPre0078`, the DDL of 0000 + 0070) and inserts the
//     bookkeeping row 0078 would leave.
//
//   DATABASE_URL=postgres://postgres:<pw>@localhost:<port>/postgres \
//     npx vitest run __tests__/actions/groupInvitesDropToken0078.test.ts
//
// What it proves:
//   1. 0078 on a table with every token_hash filled: `token` and its unique
//      constraint are gone, token_hash is NOT NULL (an INSERT without it is
//      refused 23502), the remaining indexes are exactly pkey /
//      token_hash_unique / one_open_per_group, and no row is lost.
//   2. A row with no token_hash: 0078 aborts and nothing changes.
//   3. token_hash's unique index missing, or present but invalid: 0078 aborts
//      and nothing changes.
//   4. A second run is a no-op.
//   5. The rollback script: `token` is back (nullable, empty), token_hash
//      stays NOT NULL, 0078's bookkeeping row is gone; 0078 then re-applies.
//
// Seeding never names `token` in an INSERT column list
// (`__tests__/inviteTokenColumnGuard.test.ts`), and nothing selects token
// values: rows are counted, columns are read from the catalog.
//
// Failure look of what this guards: the migration drops `token` while some
// row has no hash (that link then reads "invalid or expired" with nothing
// else erroring), or a failed guard leaves the table half-changed.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

const postgres = (await import('postgres')).default

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf-8')
const FILE_0078 = read('drizzle/0078_invite_drop_plaintext_token.sql')
// Split the way drizzle-kit does; each statement runs on its own, in order,
// inside one transaction.
const STATEMENTS_0078 = FILE_0078.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
const DOWN_0078 = read('scripts/rollback/0078_invite_drop_plaintext_token.down.sql')
const WHEN_0078 = 1783500000000

let pg: Sql

class Rollback extends Error {}

/** Run fn in a transaction that is always rolled back. */
async function rolledBack(fn: (tx: TransactionSql) => Promise<void>) {
  try {
    await pg.begin(async (tx) => {
      await fn(tx)
      throw new Rollback()
    })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
}

async function run0078(tx: TransactionSql) {
  for (const stmt of STATEMENTS_0078) await tx.unsafe(stmt)
}

/**
 * Put the table in the shape 0077 leaves it in (0000's `token` + unique
 * constraint, made nullable by 0070; token_hash nullable), plus the
 * bookkeeping row 0078 would add. Against a DB migrated through 0077 the DDL
 * changes nothing; through 0078 it re-creates that shape. Returns which one.
 */
async function toPre0078(tx: TransactionSql): Promise<'0077' | '0078'> {
  const [{ had }] = await tx<{ had: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'GroupInvites' AND column_name = 'token'
    ) AS had`
  await tx.unsafe(`ALTER TABLE "GroupInvites" ADD COLUMN IF NOT EXISTS "token" text`)
  await tx.unsafe(`ALTER TABLE "GroupInvites" ALTER COLUMN "token_hash" DROP NOT NULL`)
  await tx.unsafe(`
    DO $$ BEGIN
      IF to_regclass('"GroupInvites_token_unique"') IS NULL THEN
        ALTER TABLE "GroupInvites" ADD CONSTRAINT "GroupInvites_token_unique" UNIQUE ("token");
      END IF;
    END $$`)
  await tx`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    SELECT 'test-0078', ${WHEN_0078}
     WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = ${WHEN_0078})`
  return had ? '0077' : '0078'
}

type Shape = {
  columns: Record<string, 'YES' | 'NO'>
  constraints: string[]
  indexes: { name: string; valid: boolean }[]
  rows: number
}

/** Catalog view of GroupInvites' token columns, constraints, indexes, row count. */
async function shape(tx: TransactionSql): Promise<Shape> {
  const cols = await tx<{ column_name: string; is_nullable: 'YES' | 'NO' }[]>`
    SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'GroupInvites' AND column_name LIKE 'token%'
     ORDER BY column_name`
  const cons = await tx<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conrelid = '"GroupInvites"'::regclass ORDER BY conname`
  const idx = await tx<{ name: string; valid: boolean }[]>`
    SELECT c.relname AS name, i.indisvalid AS valid
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     WHERE i.indrelid = '"GroupInvites"'::regclass
     ORDER BY c.relname`
  const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM "GroupInvites"`
  return {
    columns: Object.fromEntries(cols.map((c) => [c.column_name, c.is_nullable])),
    constraints: cons.map((c) => c.conname),
    indexes: idx.map((i) => ({ name: i.name, valid: i.valid })),
    rows: n,
  }
}

const hex64 = () => randomBytes(32).toString('hex')

/** One group with an open, an accepted and a revoked invite, all hashed. */
async function seed(tx: TransactionSql) {
  const a = randomUUID()
  const b = randomUUID()
  // on_auth_user_created (handle_new_user) inserts the Profiles rows.
  await tx`INSERT INTO auth.users (id, raw_user_meta_data) VALUES (${a}, '{"full_name":"TEST_1288"}'::jsonb)`
  await tx`INSERT INTO auth.users (id, raw_user_meta_data) VALUES (${b}, '{"full_name":"TEST_1288"}'::jsonb)`
  const [g] = await tx<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at, base_currency)
    VALUES ('TEST_1288', ${a}, ${b}, now(), 'twd') RETURNING id`
  await tx`
    INSERT INTO "GroupInvites" (group_id, invited_by, token_hash, expires_at, accepted_at, revoked_at) VALUES
      (${g.id}, ${a}, ${hex64()}, now() + interval '1 day', NULL, NULL),
      (${g.id}, ${a}, ${hex64()}, now() - interval '1 day', now() - interval '2 days', NULL),
      (${g.id}, ${a}, ${hex64()}, now() - interval '1 day', NULL, now() - interval '2 days')`
  return { groupId: g.id, inviter: a }
}

const PRE_COLUMNS = { token: 'YES', token_hash: 'YES' }
const POST_COLUMNS = { token_hash: 'NO' }
const POST_INDEXES = [
  { name: 'GroupInvites_one_open_per_group', valid: true },
  { name: 'GroupInvites_pkey', valid: true },
  { name: 'GroupInvites_token_hash_unique', valid: true },
]

describe.skipIf(!isLocalDb)('0078 drop plaintext GroupInvites.token (#1288 I3d) — local throwaway DB', () => {
  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {}, connection: { application_name: 'test_1288_i3d' } })
    // Say which state the DB was in (both are valid starting points).
    let start = ''
    await rolledBack(async (tx) => { start = await toPre0078(tx) })
    console.info(`[0078] database migrated through ${start}`)
  })

  afterAll(async () => {
    await pg?.end()
  })

  it('pre-0078 shape: token and token_hash nullable, token unique constraint present', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      const s = await shape(tx)
      expect(s.columns).toEqual(PRE_COLUMNS)
      expect(s.constraints).toContain('GroupInvites_token_unique')
      expect(s.indexes.map((i) => i.name)).toEqual([
        'GroupInvites_one_open_per_group',
        'GroupInvites_pkey',
        'GroupInvites_token_hash_unique',
        'GroupInvites_token_unique',
      ])
    })
  })

  it('0078 drops token and its constraint, sets token_hash NOT NULL, keeps every row and the other indexes', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      const { groupId, inviter } = await seed(tx)
      const before = await shape(tx)
      expect(before.rows).toBeGreaterThanOrEqual(3)

      await run0078(tx)

      const after = await shape(tx)
      expect(after.columns).toEqual(POST_COLUMNS)
      expect(after.constraints).not.toContain('GroupInvites_token_unique')
      expect(after.indexes).toEqual(POST_INDEXES)
      expect(after.rows).toBe(before.rows)

      // NOT NULL is enforced, not just declared.
      await expect(tx.savepoint((sp) => sp`
        INSERT INTO "GroupInvites" (group_id, invited_by, expires_at)
        VALUES (${groupId}, ${inviter}, now() - interval '1 day')`))
        .rejects.toMatchObject({ code: '23502', column_name: 'token_hash' })
    })
  })

  it('a row without token_hash aborts 0078 and changes nothing', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      const { groupId, inviter } = await seed(tx)
      await tx`
        INSERT INTO "GroupInvites" (group_id, invited_by, expires_at, revoked_at)
        VALUES (${groupId}, ${inviter}, now() - interval '1 day', now())`
      const before = await shape(tx)

      await expect(tx.savepoint((sp) => run0078(sp))).rejects.toThrow(/have no token_hash/)

      expect(await shape(tx)).toEqual(before)
      expect(before.columns).toEqual(PRE_COLUMNS)
    })
  })

  it('a missing token_hash unique index aborts 0078 and changes nothing', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      await seed(tx)
      await tx.unsafe(`DROP INDEX "GroupInvites_token_hash_unique"`)
      const before = await shape(tx)

      await expect(tx.savepoint((sp) => run0078(sp))).rejects.toThrow(/GroupInvites_token_hash_unique is missing/)

      expect(await shape(tx)).toEqual(before)
      expect(before.columns).toEqual(PRE_COLUMNS)
    })
  })

  it('an invalid token_hash unique index aborts 0078 and changes nothing', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      await seed(tx)
      // What a failed CREATE INDEX CONCURRENTLY leaves behind.
      await tx`UPDATE pg_index SET indisvalid = false WHERE indexrelid = '"GroupInvites_token_hash_unique"'::regclass`
      const before = await shape(tx)
      expect(before.indexes).toContainEqual({ name: 'GroupInvites_token_hash_unique', valid: false })

      await expect(tx.savepoint((sp) => run0078(sp))).rejects.toThrow(/GroupInvites_token_hash_unique is not valid/)

      expect(await shape(tx)).toEqual(before)
    })
  })

  it('a second run of 0078 is a no-op', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      await seed(tx)
      await run0078(tx)
      const once = await shape(tx)
      await run0078(tx)
      expect(await shape(tx)).toEqual(once)
      expect(once.columns).toEqual(POST_COLUMNS)
    })
  })

  it('rollback script: token back (nullable, empty), token_hash still NOT NULL, bookkeeping row gone; 0078 re-applies', async () => {
    await rolledBack(async (tx) => {
      await toPre0078(tx)
      await seed(tx)
      await run0078(tx)
      const migrated = await shape(tx)
      const [{ others }] = await tx<{ others: number }[]>`
        SELECT count(*)::int AS others FROM drizzle.__drizzle_migrations WHERE created_at <> ${WHEN_0078}`
      expect((await tx`SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = ${WHEN_0078}`).length).toBe(1)

      await tx.unsafe(DOWN_0078).simple()

      const down = await shape(tx)
      expect(down.columns).toEqual({ token: 'YES', token_hash: 'NO' })
      expect(down.constraints).not.toContain('GroupInvites_token_unique')
      expect(down.indexes).toEqual(POST_INDEXES)
      expect(down.rows).toBe(migrated.rows)
      const [{ filled }] = await tx<{ filled: number }[]>`
        SELECT count(*)::int AS filled FROM "GroupInvites" WHERE (to_jsonb("GroupInvites") ->> 'token') IS NOT NULL`
      expect(filled).toBe(0)
      expect((await tx`SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = ${WHEN_0078}`).length).toBe(0)
      const [{ othersAfter }] = await tx<{ othersAfter: number }[]>`
        SELECT count(*)::int AS "othersAfter" FROM drizzle.__drizzle_migrations WHERE created_at <> ${WHEN_0078}`
      expect(othersAfter).toBe(others)

      // Rolling forward again works.
      await run0078(tx)
      expect(await shape(tx)).toEqual(migrated)
    })
  })
})
