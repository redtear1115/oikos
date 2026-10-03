import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql, TransactionSql } from 'postgres'
import { loadEnvLocal } from '../outing/_setup'

// ─── 0079: frozen copies under RLS — Data API / Realtime view (#1484) ──────
//
// LOCAL THROWAWAY DATABASE ONLY. Every case runs in a transaction that is
// rolled back. It skips itself unless DATABASE_URL points at localhost —
// never run it against dev or prod.
//
// Database: postgres:17 plus the Supabase stand-ins (see PR #1445's
// description: roles anon / authenticated / service_role, auth.users +
// auth.uid(), cron.*, rls_auto_enable, the supabase_realtime publication),
// db/triggers/handle_new_user.sql, then `drizzle-kit migrate` through 0079.
// The auth.uid() stand-in must read the `request.jwt.claims` JSON (as
// Supabase's does) — this file sets only that:
//   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
//     SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
//       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
//
//   DATABASE_URL=postgres://postgres:<pw>@localhost:<port>/postgres \
//     npx vitest run __tests__/actions/frozenCopyRls0079.test.ts
//
// Two stand-in gaps are filled inside each transaction, to match prod:
//   - RLS is ENABLED on Assets / FuelLogs / OikosGroups. On Supabase it was
//     enabled by the bootstrap (db/rls/policies.sql), not by a migration, so
//     a migrated stand-in has the policies but RLS off.
//   - authenticated gets SELECT on OikosGroups and FuelLogs (Supabase's
//     default ACL; 0075 already set Assets' column grants). GroupEpochs is
//     deliberately NOT granted: frozen_copy_visible is SECURITY DEFINER and
//     must not depend on it.
//
// What it proves (acting as a user = SET LOCAL ROLE authenticated +
// request.jwt.claims):
//   1. the later partner C gets 0 rows for the copy and for its FuelLogs (the
//      FuelLogs policy sub-selects Assets as the caller and inherits the
//      rule); the stayer A gets the copy and its fuel log; ordinary assets
//      and fuel logs are unchanged for both. An ex-member gets nothing (as
//      before: group-member condition).
//   2. the policy set: exactly one SELECT policy on each table, no FOR ALL,
//      legacy assets_select / fuel_logs_select absent; the helper is SECURITY
//      DEFINER, search_path pinned, EXECUTE for authenticated only.
//   3. the helper as an RPC answers only for the caller.
//   4. rollback restores 0023's policy (C sees the copy again) and drops the
//      helper; re-applying 0079 closes it again (idempotent).
//
// Failure look of what this guards: nothing errors. Too loose, a later
// partner reads the leaver's copied car / child name with their own session;
// too tight, Realtime Assets frames silently stop for legitimate members.
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
const STATEMENTS_0079 = read('drizzle/0079_frozen_copy_visibility.sql')
  .split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
const DOWN_0079 = read('scripts/rollback/0079_frozen_copy_visibility.down.sql')

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

interface World {
  A: string; B: string; C: string
  L: string
  copy: string; plain: string
  flCopy: string; flPlain: string
}

/**
 * Ledger L: A+B (−30d … −10d), B left at −10d (the freeze), A solo
 * (−10d … −5d), A+C from −5d. C also has an older solo ledger whose chapter
 * covers the freeze moment. Copy of B's car in L frozen at −10d, plus an
 * ordinary asset; one fuel log on each.
 */
async function world(tx: TransactionSql): Promise<World> {
  await tx.unsafe(`ALTER TABLE "Assets" ENABLE ROW LEVEL SECURITY`)
  await tx.unsafe(`ALTER TABLE "FuelLogs" ENABLE ROW LEVEL SECURITY`)
  await tx.unsafe(`ALTER TABLE "OikosGroups" ENABLE ROW LEVEL SECURITY`)
  await tx.unsafe(`GRANT SELECT ON "OikosGroups", "FuelLogs" TO authenticated`)

  const A = randomUUID(), B = randomUUID(), C = randomUUID()
  for (const id of [A, B, C]) await tx`INSERT INTO "Profiles" (id, display_name) VALUES (${id}, 'TEST_1484')`
  const ago = (d: number) => tx`SELECT (now() - make_interval(days => ${d}))::text AS t`.then((r) => r[0].t as string)
  const [d90, d30, d10, d5] = [await ago(90), await ago(30), await ago(10), await ago(5)]

  const [sc] = await tx<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at)
    VALUES ('TEST_1484 SC', ${C}, NULL, ${d90}) RETURNING id`
  await tx`INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id) VALUES (${sc.id}, ${d90}, NULL, ${C}, NULL)`

  const [l] = await tx<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at)
    VALUES ('TEST_1484 L', ${A}, ${C}, ${d5}) RETURNING id`
  await tx`INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id) VALUES
    (${l.id}, ${d30}, ${d10}, ${A}, ${B}),
    (${l.id}, ${d10}, ${d5}, ${A}, NULL),
    (${l.id}, ${d5}, NULL, ${A}, ${C})`

  const [copy] = await tx<{ id: string }[]>`
    INSERT INTO "Assets" (group_id, type, name, frozen_at) VALUES (${l.id}, 'car', 'TEST_1484 B car', ${d10}) RETURNING id`
  const [plain] = await tx<{ id: string }[]>`
    INSERT INTO "Assets" (group_id, type, name) VALUES (${l.id}, 'car', 'TEST_1484 A car') RETURNING id`
  const fl = async (assetId: string) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO "FuelLogs" (asset_id, liters, fuel_type, odometer, logged_at)
      VALUES (${assetId}, '30.00', '95', 1000, now()) RETURNING id`
    return r.id
  }
  return { A, B, C, L: l.id, copy: copy.id, plain: plain.id, flCopy: await fl(copy.id), flPlain: await fl(plain.id) }
}

/** Run `body` as `userId` through RLS (authenticated + JWT claims), then back to postgres. */
async function as<T>(tx: TransactionSql, userId: string, body: () => Promise<T>): Promise<T> {
  await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
  await tx.unsafe('SET LOCAL ROLE authenticated')
  try {
    return await body()
  } finally {
    await tx.unsafe('RESET ROLE')
  }
}

async function visible(tx: TransactionSql, w: World, userId: string) {
  return as(tx, userId, async () => ({
    assets: (await tx<{ id: string }[]>`SELECT id FROM "Assets" WHERE group_id = ${w.L} ORDER BY name`).map((r) => r.id),
    copyByName: (await tx<{ name: string }[]>`SELECT name FROM "Assets" WHERE id = ${w.copy}`).map((r) => r.name),
    fuel: (await tx<{ id: string }[]>`SELECT id FROM "FuelLogs" WHERE asset_id IN (${w.copy}, ${w.plain})`).map((r) => r.id).sort(),
  }))
}

describe.skipIf(!isLocalDb)('0079 frozen copy RLS — local throwaway DB', () => {
  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} })
    const [{ applied }] = await pg<{ applied: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1783600000000) AS applied`
    if (!applied) throw new Error('migrate the stand-in DB through 0079 first (drizzle-kit migrate)')
  })

  afterAll(async () => {
    await pg?.end()
  })

  it('the later partner gets 0 rows for the copy and its fuel log; the stayer gets both; ordinary rows unchanged', async () => {
    await rolledBack(async (tx) => {
      const w = await world(tx)
      const c = await visible(tx, w, w.C)
      expect(c.assets).toEqual([w.plain])
      expect(c.copyByName).toEqual([])
      expect(c.fuel).toEqual([w.flPlain])

      const a = await visible(tx, w, w.A)
      expect(a.assets).toEqual([w.plain, w.copy]) // 'TEST_1484 A car' < 'TEST_1484 B car'
      expect(a.copyByName).toEqual(['TEST_1484 B car'])
      expect(a.fuel).toEqual([w.flCopy, w.flPlain].sort())

      // B left L: no longer a member, sees nothing of L (unchanged by 0079).
      const b = await visible(tx, w, w.B)
      expect(b).toEqual({ assets: [], copyByName: [], fuel: [] })

      // The stand-in really denies authenticated on GroupEpochs, so A's pass
      // above went through the SECURITY DEFINER helper, not the caller's grant.
      const [{ ok }] = await tx<{ ok: boolean }[]>`SELECT has_table_privilege('authenticated', '"GroupEpochs"', 'SELECT') AS ok`
      expect(ok).toBe(false)
    })
  })

  it('policy set and helper attributes are exactly as intended', async () => {
    await rolledBack(async (tx) => {
      const pols = await tx<{ tablename: string; policyname: string; cmd: string; permissive: string; qual: string }[]>`
        SELECT tablename, policyname, cmd, permissive, qual FROM pg_policies
         WHERE tablename IN ('Assets', 'FuelLogs') ORDER BY tablename, policyname`
      expect(pols.map((p) => [p.tablename, p.policyname, p.cmd, p.permissive])).toEqual([
        ['Assets', 'assets_group_member_select', 'SELECT', 'PERMISSIVE'],
        ['FuelLogs', 'fuel_logs_member_select', 'SELECT', 'PERMISSIVE'],
      ])
      // pg_policies deparses without the table qualifiers the migration writes.
      expect(pols[0].qual).toContain('AND ((frozen_at IS NULL) OR frozen_copy_visible(group_id, frozen_at))')

      const [fn] = await tx<{ secdef: boolean; config: string[]; owner: string; volatile: string }[]>`
        SELECT prosecdef AS secdef, proconfig AS config, pg_get_userbyid(proowner) AS owner, provolatile AS volatile
          FROM pg_proc WHERE oid = 'public.frozen_copy_visible(uuid, timestamptz)'::regprocedure`
      expect(fn).toEqual({ secdef: true, config: ['search_path=""'], owner: 'postgres', volatile: 's' })
      const priv = async (role: string) => {
        const [r] = await tx<{ ok: boolean }[]>`
          SELECT has_function_privilege(${role}, 'public.frozen_copy_visible(uuid, timestamptz)', 'EXECUTE') AS ok`
        return r.ok
      }
      expect({
        authenticated: await priv('authenticated'),
        anon: await priv('anon'),
        service_role: await priv('service_role'),
      }).toEqual({ authenticated: true, anon: false, service_role: false })
      const [{ pub }] = await tx<{ pub: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x
                        WHERE p.oid = 'public.frozen_copy_visible(uuid, timestamptz)'::regprocedure
                          AND x.grantee = 0) AS pub`
      expect(pub).toBe(false)
    })
  })

  it('called directly (Data API RPC), the helper answers only about the caller', async () => {
    await rolledBack(async (tx) => {
      const w = await world(tx)
      const [{ frozen }] = await tx<{ frozen: string }[]>`SELECT frozen_at::text AS frozen FROM "Assets" WHERE id = ${w.copy}`
      const ask = (userId: string) => as(tx, userId, async () => {
        const [r] = await tx<{ v: boolean }[]>`SELECT public.frozen_copy_visible(${w.L}, ${frozen}::timestamptz) AS v`
        return r.v
      })
      expect(await ask(w.A)).toBe(true)
      expect(await ask(w.B)).toBe(true) // B was there at the freeze; RLS still hides L from B (not a member)
      expect(await ask(w.C)).toBe(false)
      // No session at all: false, not an error.
      await tx.unsafe('SET LOCAL ROLE authenticated')
      await tx`SELECT set_config('request.jwt.claims', '', true)`
      const [r] = await tx<{ v: boolean }[]>`SELECT public.frozen_copy_visible(${w.L}, ${frozen}::timestamptz) AS v`
      await tx.unsafe('RESET ROLE')
      expect(r.v).toBe(false)
    })
  })

  it('rollback restores the 0023 policy (C sees the copy again) and drops the helper; 0079 re-applies', async () => {
    await rolledBack(async (tx) => {
      const w = await world(tx)
      await tx.unsafe(DOWN_0079)
      const [{ fn }] = await tx<{ fn: string | null }[]>`SELECT to_regprocedure('public.frozen_copy_visible(uuid, timestamptz)')::text AS fn`
      expect(fn).toBeNull()
      const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at = 1783600000000`
      expect(n).toBe(0)
      expect((await visible(tx, w, w.C)).copyByName).toEqual(['TEST_1484 B car'])

      for (const stmt of STATEMENTS_0079) await tx.unsafe(stmt)
      expect((await visible(tx, w, w.C)).copyByName).toEqual([])
      // …and a second apply is a no-op.
      for (const stmt of STATEMENTS_0079) await tx.unsafe(stmt)
      const c = await visible(tx, w, w.C)
      expect(c.copyByName).toEqual([])
      expect(c.assets).toEqual([w.plain])
      expect((await visible(tx, w, w.A)).copyByName).toEqual(['TEST_1484 B car'])
    })
  })
})
