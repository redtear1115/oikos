import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql, TransactionSql } from 'postgres'
import { createStandInDb, dropStandInDb, isLocalUrl, migrateThrough } from './_supabaseStandIn'
import { privilegeLines, ALLOWLIST_AFTER_0080 } from './_dataApiAllowlist'

// ─── 0080: Data API / Realtime reads stop at the chapter (#1518) ────────────
//
// LOCAL THROWAWAY SERVER ONLY. Skips itself unless DATABASE_URL points at
// localhost; never run it against dev or prod. It creates its OWN database on
// that server (createStandInDb: Supabase stand-ins INCLUDING the default ACL
// that grants anon / authenticated ALL, then drizzle's migrator through
// 0079), runs the "before" controls, applies 0080 through the same migrator,
// runs the "after" cases, and drops the database. Data cases run in
// transactions that are rolled back.
//
//   docker run -d --name pg-1518 -e POSTGRES_PASSWORD=pg -p 127.0.0.1:55518:5432 postgres:17
//   DATABASE_URL=postgres://postgres:pg@127.0.0.1:55518/postgres \
//     npx vitest run __tests__/actions/chapterScopedRls1518.test.ts
//
// World: ledger G — chapter 1 A+B (−30d … −10d), B leaves; chapter 2 A solo
// (−10d … −5d); chapter 3 A+C (−5d …). Money rows in G at −40d (older than
// the first chapter → belongs to it), −20d, −7d, −3d. B's own row moved into
// B's new solo ledger SB keeps created_at −20d (older than SB's first chapter).
// Acting as a user = SET LOCAL ROLE authenticated + request.jwt.claims, which
// is what PostgREST and realtime.apply_rls do.
//
// Failure look of what this guards: nothing errors. Too loose, a later
// partner reads an earlier chapter's rows with their own session; too tight,
// Realtime frames silently stop for legitimate members.
// ──────────────────────────────────────────────────────────────────────────────

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const adminUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = isLocalUrl(adminUrl)
const postgres = (await import('postgres')).default

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf-8')
const STATEMENTS_0080 = read('drizzle/0080_chapter_scoped_rls.sql')
  .split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)
const POLICIES_DOWN = read('scripts/rollback/0080_chapter_scoped_rls.policies.down.sql')
const GRANTS_DOWN = read('scripts/rollback/0080_chapter_scoped_rls.grants.down.sql')
const WHEN_0080 = 1783700000000

const MONEY = ['CashTransactions', 'IncomeTransactions', 'Settlements'] as const
const REVOKED = [
  'CurrencyRates', 'GroupEpochs', 'GroupInvites', 'ImportBatches', 'ImportErrors',
  'InvoiceImportRuns', 'InvoiceImportSnapshots', 'MonthlyReviewMessages',
  'MonthlyReviewSnapshots', 'PartnerQuizAnswers', 'PartnerQuizSessions',
  'PlantDetails', 'Profiles', 'TripExpenses', 'Trips',
]

// The read-only grant / policy check of dev and prod on 2026-10-03
// (has_table_privilege SELECT for authenticated / anon, any authenticated
// column grant, realtime publication, policies). The stand-in must match it
// before 0080, or its "before / after" says nothing about prod.
const PROD_2026_10_03 = `
Assets	rls	-	authcol	-	RT	assets_group_member_select:r
CarDetails	rls	-	-	-	-	car_details_member_select:r
CashTransactions	rls	AUTH	authcol	ANON	RT	txns_group_member_select:r
ChildDetails	rls	-	-	-	-	child_details_member_select:r
CurrencyRates	rls	AUTH	authcol	ANON	-	currency_rates_member_select:r
FuelLogs	rls	AUTH	authcol	ANON	RT	fuel_logs_member_select:r
GroupBalance	rls	AUTH	authcol	ANON	RT	balance_group_member_select:r
GroupEpochs	rls	AUTH	authcol	ANON	-	group_epochs_select_members:r
GroupInvites	rls	AUTH	authcol	ANON	-	invites_select:r
HouseDetails	rls	-	-	-	-	house_details_member_select:r
ImportBatches	rls	AUTH	authcol	ANON	-	import_batches_group_member_select:r
ImportErrors	rls	AUTH	authcol	ANON	-	import_errors_group_member_select:r
IncomeTransactions	rls	AUTH	authcol	ANON	RT	incomes_group_member_select:r
InsuranceDetails	rls	-	-	-	-	insurance_details_member_select:r
InvoiceCredentials	rls	-	-	-	-	invoice_credentials_owner_select:r
InvoiceImportRuns	rls	AUTH	authcol	ANON	-	invoice_runs_group_member_select:r,invoice_runs_owner_insert:a,invoice_runs_owner_update:w
InvoiceImportSnapshots	rls	AUTH	authcol	ANON	-	invoice_snapshots_group_member_select:r
MonthlyReviewMessages	rls	AUTH	authcol	ANON	RT	monthly_review_message_member_select:r
MonthlyReviewSnapshots	rls	AUTH	authcol	ANON	-	monthly_review_snapshot_member_select:r
OikosGroups	rls	AUTH	authcol	ANON	RT	groups_member_select:r
OutingExpenseShares	rls	-	-	-	-
OutingExpenses	rls	-	-	-	-
OutingParticipants	rls	-	-	-	-
OutingSettlements	rls	-	-	-	-
Outings	rls	-	-	-	-
PartnerQuizAnswers	rls	AUTH	authcol	ANON	-	partner_quiz_answer_member_select:r
PartnerQuizSessions	rls	AUTH	authcol	ANON	-	partner_quiz_session_member_select:r
PendingExpenseOccurrences	rls	AUTH	authcol	ANON	RT	expense_pendings_group_member_select:r
PendingIncomeOccurrences	rls	AUTH	authcol	ANON	RT	pendings_group_member_select:r
PetDetails	rls	-	-	-	-	pet_details_member_select:r
PlantDetails	rls	AUTH	authcol	ANON	-	plant_details_member_select:r
Profiles	rls	AUTH	authcol	ANON	-	profiles_self_or_partner_select:r
PushTokens	rls	AUTH	authcol	ANON	RT	push_tokens_owner_all:*
RecurringExpenseRules	rls	AUTH	authcol	ANON	RT	expense_rules_group_member_select:r
RecurringIncomeRules	rls	AUTH	authcol	ANON	RT	rules_group_member_select:r
Settlements	rls	AUTH	authcol	ANON	RT	settles_group_member_select:r
TripExpenses	rls	AUTH	authcol	ANON	-	trip_expenses_member_select:r
Trips	rls	AUTH	authcol	ANON	-	trips_member_select:r`.trim().split('\n').map((l) => l.trimEnd())

let url = ''
let pg: Sql
let preLines: string[] = []
let prePolicies: string[] = []

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

type Who = string | 'anon' | 'no-session'

async function become(tx: TransactionSql, who: Who) {
  if (who === 'anon') {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`
    await tx.unsafe('SET LOCAL ROLE anon')
  } else if (who === 'no-session') {
    await tx`SELECT set_config('request.jwt.claims', '', true)`
    await tx.unsafe('SET LOCAL ROLE authenticated')
  } else {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: who, role: 'authenticated' })}, true)`
    await tx.unsafe('SET LOCAL ROLE authenticated')
  }
}

/** Run `body` as `who` through RLS, then back to postgres. Errors propagate. */
async function as<T>(tx: TransactionSql, who: Who, body: () => Promise<T>): Promise<T> {
  await become(tx, who)
  try {
    return await body()
  } finally {
    await tx.unsafe('RESET ROLE')
  }
}

/** SQLSTATE of `query` run as `who` inside a savepoint, or null if it succeeded. Leaves no effects. */
async function sqlstate(tx: TransactionSql, who: Who, query: string): Promise<string | null> {
  try {
    await tx.savepoint(async (sp) => {
      await become(sp as unknown as TransactionSql, who)
      await sp.unsafe(query)
      throw new Rollback()
    })
  } catch (e) {
    if (e instanceof Rollback) return null
    return (e as { code?: string }).code ?? String(e)
  }
  return null
}

interface World {
  A: string; B: string; C: string
  G: string; SB: string
  rows: Record<(typeof MONEY)[number], { d40: string; d20: string; d7: string; d3: string }>
  moved: string
  fuel: { x3: string; x20: string; y20: string; z3: string }
  ts: { d40: string; d20: string; d10: string; d7: string; d5: string; d3: string }
}

async function world(tx: TransactionSql): Promise<World> {
  const A = randomUUID(), B = randomUUID(), C = randomUUID()
  for (const id of [A, B, C]) await tx`INSERT INTO "Profiles" (id, display_name) VALUES (${id}, 'TEST_1518')`
  const ago = (d: number) => tx`SELECT (now() - make_interval(days => ${d}))::text AS t`.then((r) => r[0].t as string)
  const ts = { d40: await ago(40), d30: await ago(30), d20: await ago(20), d10: await ago(10), d7: await ago(7), d5: await ago(5), d3: await ago(3) }

  const [g] = await tx<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at)
    VALUES ('TEST_1518 G', ${A}, ${C}, ${ts.d5}) RETURNING id`
  await tx`INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id) VALUES
    (${g.id}, ${ts.d30}, ${ts.d10}, ${A}, ${B}),
    (${g.id}, ${ts.d10}, ${ts.d5}, ${A}, NULL),
    (${g.id}, ${ts.d5}, NULL, ${A}, ${C})`
  const [sb] = await tx<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at)
    VALUES ('TEST_1518 SB', ${B}, NULL, ${ts.d10}) RETURNING id`
  await tx`INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id) VALUES (${sb.id}, ${ts.d10}, NULL, ${B}, NULL)`
  await tx`INSERT INTO "GroupBalance" (group_id, balance, version) VALUES (${g.id}, 0, 1) ON CONFLICT (group_id) DO NOTHING`

  const cash = async (group: string, payer: string, at: string) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO "CashTransactions" (group_id, paid_by, amount, split_type, split_ratio_a, description, category, transacted_at, created_at)
      VALUES (${group}, ${payer}, 100, 'weighted', 60, 'TEST_1518', 'dining', ${at}, ${at}) RETURNING id`
    return r.id
  }
  const income = async (at: string) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO "IncomeTransactions" (group_id, recipient_id, amount, category, occurred_at, created_at)
      VALUES (${g.id}, ${A}, 100, 'salary', ${at}::timestamptz::date, ${at}) RETURNING id`
    return r.id
  }
  const settle = async (at: string) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO "Settlements" (group_id, paid_by, amount, settled_at, created_at)
      VALUES (${g.id}, ${A}, 100, ${at}, ${at}) RETURNING id`
    return r.id
  }
  const rows = {
    CashTransactions: { d40: await cash(g.id, A, ts.d40), d20: await cash(g.id, A, ts.d20), d7: await cash(g.id, A, ts.d7), d3: await cash(g.id, A, ts.d3) },
    IncomeTransactions: { d40: await income(ts.d40), d20: await income(ts.d20), d7: await income(ts.d7), d3: await income(ts.d3) },
    Settlements: { d40: await settle(ts.d40), d20: await settle(ts.d20), d7: await settle(ts.d7), d3: await settle(ts.d3) },
  }
  const moved = await cash(sb.id, B, ts.d20)

  const asset = async (name: string, at: string, frozenAt: string | null) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO "Assets" (group_id, type, name, created_at, frozen_at) VALUES (${g.id}, 'car', ${name}, ${at}, ${frozenAt}) RETURNING id`
    return r.id
  }
  const X = await asset('TEST_1518 X (chapter 1)', ts.d20, null)
  const Y = await asset('TEST_1518 Y (chapter 3)', ts.d3, null)
  const Z = await asset('TEST_1518 Z (frozen copy)', ts.d20, ts.d10)
  const fl = async (assetId: string, at: string) => {
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO "FuelLogs" (asset_id, liters, fuel_type, odometer, logged_at, created_at)
      VALUES (${assetId}, '30.00', '95', 1000, ${at}, ${at}) RETURNING id`
    return r.id
  }
  const fuel = { x3: await fl(X, ts.d3), x20: await fl(X, ts.d20), y20: await fl(Y, ts.d20), z3: await fl(Z, ts.d3) }

  await tx`INSERT INTO "RecurringExpenseRules" (group_id, paid_by, amount, split_type, description, category, day_of_month, starts_on, next_occurrence_at)
           VALUES (${g.id}, ${A}, 100, 'half', 'TEST_1518 rent', 'housing', 1, now()::date, now()::date)`
  await tx`INSERT INTO "Trips" (group_id, epoch_id, name, start_date)
           SELECT ${g.id}, e.id, 'TEST_1518 chapter-1 trip', ${ts.d20}::timestamptz::date FROM "GroupEpochs" e
            WHERE e.group_id = ${g.id} AND e.member_b_id = ${B}`
  return { A, B, C, G: g.id, SB: sb.id, rows, moved, fuel, ts }
}

/** Ids of the world's money rows / fuel logs `who` can read. */
async function visible(tx: TransactionSql, w: World, who: Who) {
  return as(tx, who, async () => {
    const out: Record<string, string[]> = {}
    for (const t of MONEY) {
      const all = Object.values(w.rows[t])
      out[t] = (await tx<{ id: string }[]>`SELECT id FROM ${tx(t)} WHERE id IN ${tx(all)}`).map((r) => r.id).sort()
    }
    out.FuelLogs = (await tx<{ id: string }[]>`SELECT id FROM "FuelLogs" WHERE id IN ${tx(Object.values(w.fuel))}`).map((r) => r.id).sort()
    out.moved = (await tx<{ id: string }[]>`SELECT id FROM "CashTransactions" WHERE id = ${w.moved}`).map((r) => r.id)
    return out
  })
}

const pick = (w: World, keys: ('d40' | 'd20' | 'd7' | 'd3')[]) => Object.fromEntries(
  MONEY.map((t) => [t, keys.map((k) => w.rows[t][k]).sort()]),
)

/** realtime.apply_rls's visibility check for one row: `select exists(select 1 from <t> where id = …)` as the subscriber. */
async function realtimeSees(tx: TransactionSql, who: Who, table: string, id: string) {
  return as(tx, who, async () => {
    const [r] = await tx.unsafe(`SELECT EXISTS (SELECT 1 FROM "${table}" WHERE id = '${id}') AS v`)
    return r.v as boolean
  })
}

async function policyLines(sql: Sql | TransactionSql) {
  const rows = await sql<{ l: string }[]>`
    SELECT tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') AS l
      FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`
  return rows.map((r) => r.l)
}

describe.skipIf(!isLocalDb)('0080 chapter-scoped RLS — fresh local stand-in', () => {
  beforeAll(async () => {
    url = await createStandInDb(adminUrl, '0079')
    pg = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
    preLines = await privilegeLines(pg)
    prePolicies = await policyLines(pg)
  })

  afterAll(async () => {
    await pg?.end()
    if (url) await dropStandInDb(adminUrl, url)
  })

  describe('before 0080 (positive controls: the stand-in reproduces the exposure)', () => {
    it('grants, RLS, publication and policies match the 2026-10-03 dev / prod check', async () => {
      const rows = await pg<{ line: string }[]>`
        SELECT concat_ws(E'\t', c.relname, CASE WHEN c.relrowsecurity THEN 'rls' ELSE 'NORLS' END,
          CASE WHEN has_table_privilege('authenticated', c.oid, 'SELECT') THEN 'AUTH' ELSE '-' END,
          CASE WHEN EXISTS (SELECT 1 FROM information_schema.column_privileges cp WHERE cp.table_schema = 'public'
                             AND cp.table_name = c.relname AND cp.grantee = 'authenticated' AND cp.privilege_type = 'SELECT')
               THEN 'authcol' ELSE '-' END,
          CASE WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN 'ANON' ELSE '-' END,
          CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables p WHERE p.pubname = 'supabase_realtime'
                             AND p.schemaname = 'public' AND p.tablename = c.relname) THEN 'RT' ELSE '-' END,
          coalesce((SELECT string_agg(polname || ':' || polcmd::text, ',' ORDER BY polname) FROM pg_policy WHERE polrelid = c.oid), '')) AS line
          FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' ORDER BY c.relname`
      expect(rows.map((r) => r.line.trimEnd())).toEqual(PROD_2026_10_03)
    })

    it('a later partner reads the earlier chapters\' money rows, and the to-be-revoked tables', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        const c = await visible(tx, w, w.C)
        expect({ ...c, FuelLogs: undefined, moved: undefined }).toEqual({ ...pick(w, ['d40', 'd20', 'd7', 'd3']), FuelLogs: undefined, moved: undefined })
        expect(c.FuelLogs).toEqual([w.fuel.x3, w.fuel.x20, w.fuel.y20].sort()) // z3: 0079 already hides the frozen copy
        // The chapter rows name the earlier partner B, and the chapter-1 trip is readable.
        const epochs = await as(tx, w.C, () => tx`SELECT member_b_id FROM "GroupEpochs" WHERE group_id = ${w.G} AND member_b_id = ${w.B}`)
        expect(epochs.length).toBe(1)
        const trips = await as(tx, w.C, () => tx`SELECT name FROM "Trips" WHERE group_id = ${w.G}`)
        expect(trips.map((r) => r.name)).toEqual(['TEST_1518 chapter-1 trip'])
        // A swap-style UPDATE of the whole ledger: realtime would deliver the chapter-1 row to C.
        await tx`UPDATE "CashTransactions" SET split_ratio_a = 100 - split_ratio_a WHERE group_id = ${w.G}`
        expect(await realtimeSees(tx, w.C, 'CashTransactions', w.rows.CashTransactions.d20)).toBe(true)
        // anon holds table privileges (RLS alone returns 0 rows).
        expect(await sqlstate(tx, 'anon', 'SELECT 1 FROM "Profiles" LIMIT 1')).toBeNull()
        for (const t of REVOKED) expect(await sqlstate(tx, w.C, `SELECT 1 FROM "${t}" LIMIT 1`), t).toBeNull()
      })
    })
  })

  describe('after 0080', () => {
    beforeAll(async () => {
      await migrateThrough(url, '0080')
      const [{ n }] = await pg<{ n: number }[]>`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at = ${WHEN_0080}`
      if (n !== 1) throw new Error('0080 was not applied by the migrator')
    })

    it('the later partner gets only their own chapter; the stayer gets all; the leaver gets their moved row only', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        const c = await visible(tx, w, w.C)
        for (const t of MONEY) expect(c[t], t).toEqual(pick(w, ['d3'])[t])
        expect(c.FuelLogs).toEqual([w.fuel.x3]) // F3: chapter-3 log on a chapter-1 asset; not y20 / x20; not the frozen z3
        expect(c.moved).toEqual([])

        const a = await visible(tx, w, w.A)
        for (const t of MONEY) expect(a[t], t).toEqual(pick(w, ['d40', 'd20', 'd7', 'd3'])[t])
        expect(a.FuelLogs).toEqual(Object.values(w.fuel).sort())
        expect(a.moved).toEqual([])

        const b = await visible(tx, w, w.B)
        for (const t of MONEY) expect(b[t], t).toEqual([])
        expect(b.FuelLogs).toEqual([])
        expect(b.moved).toEqual([w.moved]) // older than SB's first chapter → covered by it

        for (const who of ['anon', 'no-session'] as const) {
          const v = await sqlstate(tx, who, 'SELECT 1 FROM "CashTransactions"')
          if (who === 'anon') expect(v).toBe('42501')
          else expect((await visible(tx, w, who)).CashTransactions).toEqual([])
        }
      })
    })

    it('F1: after a swap-style UPDATE of the whole ledger, realtime\'s check passes for the stayer only', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        await tx`UPDATE "CashTransactions" SET split_ratio_a = 100 - split_ratio_a WHERE group_id = ${w.G}`
        const id = w.rows.CashTransactions.d20
        expect(await realtimeSees(tx, w.C, 'CashTransactions', id)).toBe(false)
        expect(await realtimeSees(tx, w.A, 'CashTransactions', id)).toBe(true)
        expect(await realtimeSees(tx, w.C, 'CashTransactions', w.rows.CashTransactions.d3)).toBe(true)
        // A new row now (the realtime INSERT case) reaches both members.
        const [n] = await tx<{ id: string }[]>`
          INSERT INTO "CashTransactions" (group_id, paid_by, amount, split_type, description, category, transacted_at)
          VALUES (${w.G}, ${w.C}, 5, 'half', 'TEST_1518 new', 'dining', now()) RETURNING id`
        expect(await realtimeSees(tx, w.C, 'CashTransactions', n.id)).toBe(true)
        expect(await realtimeSees(tx, w.A, 'CashTransactions', n.id)).toBe(true)
        // Ledger-scoped tables still reach the later partner (GroupBalance, recurring rules, Assets, the group row).
        await tx`UPDATE "GroupBalance" SET version = version + 1 WHERE group_id = ${w.G}`
        const [rule] = await tx<{ id: string }[]>`SELECT id FROM "RecurringExpenseRules" WHERE group_id = ${w.G}`
        const [x] = await tx<{ id: string }[]>`SELECT id FROM "Assets" WHERE group_id = ${w.G} AND name LIKE '%X%'`
        for (const who of [w.A, w.C]) {
          expect(await as(tx, who, () => tx`SELECT exists(SELECT 1 FROM "GroupBalance" WHERE group_id = ${w.G}) AS v`.then((r) => r[0].v))).toBe(true)
          expect(await realtimeSees(tx, who, 'RecurringExpenseRules', rule.id)).toBe(true)
          expect(await realtimeSees(tx, who, 'Assets', x.id)).toBe(true)
          expect(await realtimeSees(tx, who, 'OikosGroups', w.G)).toBe(true)
        }
      })
    })

    it('revoked tables and anon get 42501; trimmed tables give only the granted columns; PushTokens upsert works', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        for (const t of REVOKED) expect(await sqlstate(tx, w.C, `SELECT 1 FROM "${t}" LIMIT 1`), t).toBe('42501')
        const tables = await tx<{ t: string }[]>`SELECT relname AS t FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`
        expect(tables.length).toBe(PROD_2026_10_03.length)
        for (const { t } of tables) expect(await sqlstate(tx, 'anon', `SELECT 1 FROM "${t}" LIMIT 1`), t).toBe('42501')

        const ok = async (q: string) => expect(await sqlstate(tx, w.C, q), q).toBeNull()
        const no = async (q: string) => expect(await sqlstate(tx, w.C, q), q).toBe('42501')
        await ok(`SELECT id, member_a, member_b FROM "OikosGroups"`)
        await no(`SELECT name FROM "OikosGroups"`)
        await ok(`SELECT group_id, balance, version FROM "GroupBalance"`)
        await no(`SELECT last_calculated_at FROM "GroupBalance"`)
        for (const t of ['RecurringExpenseRules', 'RecurringIncomeRules', 'PendingExpenseOccurrences', 'PendingIncomeOccurrences']) {
          await ok(`SELECT id, group_id FROM "${t}"`)
          await no(`SELECT created_at FROM "${t}"`)
        }
        await ok(`SELECT * FROM "CashTransactions"`)
        await no(`DELETE FROM "CashTransactions"`)
        await no(`UPDATE "Settlements" SET amount = 1`)
        await no(`SELECT name_encrypted FROM "Assets"`)
        const rule = await as(tx, w.C, () => tx`SELECT id, group_id FROM "RecurringExpenseRules" WHERE group_id = ${w.G}`)
        expect(rule.length).toBe(1)

        // PushTokens: the client's upsert, as PostgREST runs it (merge-duplicates), twice — insert then update path.
        const upsert = `INSERT INTO "PushTokens" (user_id, group_id, platform, token)
          VALUES ('${w.C}', '${w.G}', 'apns', 'TEST_1518_token')
          ON CONFLICT (user_id, platform, token) DO UPDATE SET user_id = EXCLUDED.user_id, group_id = EXCLUDED.group_id,
            platform = EXCLUDED.platform, token = EXCLUDED.token`
        await as(tx, w.C, async () => { await tx.unsafe(upsert); await tx.unsafe(upsert) })
        const mine = await as(tx, w.C, () => tx`SELECT token FROM "PushTokens" WHERE user_id = ${w.C}`)
        expect(mine.map((r) => r.token)).toEqual(['TEST_1518_token'])
        await no(`DELETE FROM "PushTokens"`)
      })
    })

    it('F2: the helper answers only about the caller; no session → false; anon → 42501', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        const ask = (who: Who, at: string) => as(tx, who, async () => {
          const [r] = await tx<{ v: boolean }[]>`SELECT public.viewer_in_chapter(${w.G}, ${at}::timestamptz) AS v`
          return r.v
        })
        expect(await ask(w.A, w.ts.d40)).toBe(true)
        expect(await ask(w.A, w.ts.d20)).toBe(true)
        expect(await ask(w.A, w.ts.d7)).toBe(true)
        expect(await ask(w.C, w.ts.d40)).toBe(false)
        expect(await ask(w.C, w.ts.d20)).toBe(false)
        expect(await ask(w.C, w.ts.d7)).toBe(false)
        expect(await ask(w.C, w.ts.d5)).toBe(true) // chapter boundary: [started_at, ended_at)
        expect(await ask(w.C, w.ts.d3)).toBe(true)
        expect(await ask(w.B, w.ts.d20)).toBe(true) // B was in chapter 1; RLS still hides G (not a member now)
        expect(await ask(w.B, w.ts.d3)).toBe(false)
        expect(await ask('no-session', w.ts.d3)).toBe(false)
        expect(await sqlstate(tx, 'anon', `SELECT public.viewer_in_chapter('${w.G}', now())`)).toBe('42501')
      })
    })

    it('policies, helper and every anon / authenticated privilege are exactly as intended', async () => {
      await rolledBack(async (tx) => {
        expect(await privilegeLines(tx)).toEqual(ALLOWLIST_AFTER_0080)

        // Only the four money policies changed; Assets (0079) and every other policy are untouched.
        const post = await policyLines(tx)
        const changed = (lines: string[]) => lines.filter((l) => !post.includes(l) || !prePolicies.includes(l))
        expect(changed(prePolicies).map((l) => l.split('|').slice(0, 2).join('|')).sort()).toEqual([
          'CashTransactions|txns_group_member_select', 'FuelLogs|fuel_logs_member_select',
          'IncomeTransactions|incomes_group_member_select', 'Settlements|settles_group_member_select',
        ])
        expect(post.length).toBe(prePolicies.length)
        const pols = await tx<{ tablename: string; policyname: string; cmd: string; permissive: string; qual: string }[]>`
          SELECT tablename, policyname, cmd, permissive, qual FROM pg_policies
           WHERE tablename IN ('CashTransactions', 'IncomeTransactions', 'Settlements', 'FuelLogs') ORDER BY tablename`
        expect(pols.map((p) => [p.tablename, p.cmd, p.permissive])).toEqual([
          ['CashTransactions', 'SELECT', 'PERMISSIVE'], ['FuelLogs', 'SELECT', 'PERMISSIVE'],
          ['IncomeTransactions', 'SELECT', 'PERMISSIVE'], ['Settlements', 'SELECT', 'PERMISSIVE'],
        ])
        for (const p of pols) expect(p.qual, p.tablename).toContain('viewer_in_chapter(')
        expect(pols.find((p) => p.tablename === 'FuelLogs')!.qual).toContain('viewer_in_chapter("Assets".group_id, "FuelLogs".created_at)')

        const [fn] = await tx<{ secdef: boolean; config: string[]; owner: string; volatile: string }[]>`
          SELECT prosecdef AS secdef, proconfig AS config, pg_get_userbyid(proowner) AS owner, provolatile AS volatile
            FROM pg_proc WHERE oid = 'public.viewer_in_chapter(uuid, timestamptz)'::regprocedure`
        expect(fn).toEqual({ secdef: true, config: ['search_path=""'], owner: 'postgres', volatile: 's' })
        const [{ svc, pub }] = await tx<{ svc: boolean; pub: boolean }[]>`
          SELECT has_function_privilege('service_role', 'public.viewer_in_chapter(uuid, timestamptz)', 'EXECUTE') AS svc,
                 EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x
                          WHERE p.oid = 'public.viewer_in_chapter(uuid, timestamptz)'::regprocedure AND x.grantee = 0) AS pub`
        expect({ svc, pub }).toEqual({ svc: false, pub: false })
      })
    })

    it('negative controls: an added permissive policy or a stray grant is caught', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        await tx.unsafe(`CREATE POLICY "test_1518_wide" ON "CashTransactions" FOR SELECT USING (true)`)
        // OR-ed with the chapter policy: C reads chapter 1 again — why the policy-set assertion matters.
        expect((await visible(tx, w, w.C)).CashTransactions).toEqual(pick(w, ['d40', 'd20', 'd7', 'd3']).CashTransactions)
        await tx.unsafe(`GRANT SELECT ON "Profiles" TO authenticated`)
        const extra = (await privilegeLines(tx)).filter((l) => !ALLOWLIST_AFTER_0080.includes(l))
        expect(extra).toEqual(['Profiles|authenticated|T:SELECT'])
      })
    })

    it('rollback: policies.down restores pre-0080 visibility and keeps the revokes; grants.down restores the full pre-0080 matrix; 0080 re-applies', async () => {
      await rolledBack(async (tx) => {
        const w = await world(tx)
        await tx.unsafe(POLICIES_DOWN)
        const c = await visible(tx, w, w.C)
        for (const t of MONEY) expect(c[t], t).toEqual(pick(w, ['d40', 'd20', 'd7', 'd3'])[t])
        expect(c.FuelLogs).toEqual([w.fuel.x3, w.fuel.x20, w.fuel.y20].sort()) // 0079 still hides z3
        const [fns] = await tx<{ vic: string | null; fcv: string | null }[]>`
          SELECT to_regprocedure('public.viewer_in_chapter(uuid, timestamptz)')::text AS vic,
                 to_regprocedure('public.frozen_copy_visible(uuid, timestamptz)')::text AS fcv`
        expect(fns).toEqual({ vic: null, fcv: 'frozen_copy_visible(uuid,timestamp with time zone)' })
        const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at = ${WHEN_0080}`
        expect(n).toBe(0)
        expect(await policyLines(tx)).toEqual(prePolicies)
        for (const t of REVOKED) expect(await sqlstate(tx, w.C, `SELECT 1 FROM "${t}" LIMIT 1`), t).toBe('42501')
        expect(await sqlstate(tx, 'anon', 'SELECT 1 FROM "CashTransactions"')).toBe('42501')
        // Realtime gets every column of the kept tables back.
        expect(await sqlstate(tx, w.C, 'SELECT * FROM "OikosGroups"')).toBeNull()

        await tx.unsafe(GRANTS_DOWN)
        expect(await privilegeLines(tx)).toEqual(preLines)

        for (const stmt of STATEMENTS_0080) await tx.unsafe(stmt)
        for (const stmt of STATEMENTS_0080) await tx.unsafe(stmt) // idempotent
        expect(await privilegeLines(tx)).toEqual(ALLOWLIST_AFTER_0080)
        const again = await visible(tx, w, w.C)
        for (const t of MONEY) expect(again[t], t).toEqual(pick(w, ['d3'])[t])
      })
    })
  })
})
