import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql, TransactionSql } from 'postgres'
import { loadEnvLocal } from '../outing/_setup'

// ─── 0069 invoice credential retention (#1289, #1376) + lock order (#1427) ──
//
// LOCAL THROWAWAY DATABASE ONLY. This file commits 0069 (DDL, a whole-table
// backfill, a cron re-schedule), swaps process_account_deletions back to
// 0068's body for a control run, and lets the deletion job process every
// pending user. It skips itself unless DATABASE_URL points at localhost —
// never run it against dev or prod.
//
// A throwaway database: plain postgres:17 plus the Supabase stand-ins
// (auth.users + auth.uid(), cron.schedule / cron.unschedule, roles, the
// supabase_realtime publication, public.rls_auto_enable), then every
// migration up to 0068 in journal order, then db/triggers/handle_new_user.sql.
// The PR description has the exact commands.
//
//   DATABASE_URL=postgres://postgres:<pw>@localhost:<port>/postgres \
//     npx vitest run __tests__/actions/invoiceRetention0069.test.ts
//
// What it proves:
//   1. the CHECK: a soft-deleted row can't keep its ciphertext, a live row
//      can't lack it (23514);
//   2. runs survive their credential's hard delete, credential_id NULL;
//   3. the backfill and a second apply;
//   4. account deletion: the left-then-solo shape that used to fail forever
//      (F2 — credential moved to the new group, run left in the old one),
//      shown failing under the old FK and passing under 0069; and a paired
//      user's credentials are hard-deleted;
//   5. the cron body: 30-day credential purge, 1-year run purge, no FK error;
//   6. the actions: delete / refresh / double submit / leave / removePartner;
//   7. #1427: an outing write interleaved with the job — deadlock under
//      0068's function, both commit under 0069's.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()
vi.setConfig({ testTimeout: 60_000 })
process.env.INVOICE_MOCK_MODE = '1'

const databaseUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = (() => {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)
  } catch {
    return false
  }
})()

const { AsyncLocalStorage } = await import('node:async_hooks')
const viewerStore = new AsyncLocalStorage<string>()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: viewerStore.getStore() ?? '' } }, error: null }),
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))
// The real mock-mode API, plus a one-shot hook that runs after the MoF check —
// between createInvoiceCredential's pre-check SELECT and its INSERT.
const apiHook: { afterVerify?: () => Promise<void> } = {}
vi.mock('@/lib/invoice/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/invoice/api')>()
  return {
    ...real,
    fetchInvoicesByCarrier: async (args: Parameters<typeof real.fetchInvoicesByCarrier>[0]) => {
      const result = await real.fetchInvoicesByCarrier(args)
      const hook = apiHook.afterVerify
      apiHook.afterVerify = undefined
      if (hook) await hook()
      return result
    },
  }
})

const postgres = (await import('postgres')).default
type Tx = TransactionSql

const MIGRATION = readFileSync(resolve(__dirname, '../../drizzle/0069_invoice_credential_retention.sql'), 'utf-8')
const FN_0068 = readFileSync(resolve(__dirname, '../../drizzle/0068_account_deletion_tombstone.sql'), 'utf-8')
  .split('--> statement-breakpoint')[0]
const FN_0069 = MIGRATION.split('--> statement-breakpoint')
  .find((s) => s.includes('CREATE OR REPLACE FUNCTION public.process_account_deletions'))!
const CRON_0069 = /cron\.schedule\('cleanup-soft-deleted', '0 3 \* \* 0', \$\$([\s\S]*?)\$\$\);/.exec(MIGRATION)![1]

const ROLLBACK = new Error('rollback')
const CIPHER = 'v1:k1:00:11:22'
const notices: string[] = []
let pg: Sql

/** Runs `body` in a transaction and always rolls it back. */
async function inRolledBackTx(body: (tx: Tx) => Promise<void>) {
  await expect(pg.begin(async (tx) => {
    await body(tx)
    throw ROLLBACK
  })).rejects.toBe(ROLLBACK)
}

async function profile(tx: Sql | Tx, opts: { pending?: boolean; auth?: boolean } = {}) {
  const id = randomUUID()
  if (opts.auth) {
    await tx`INSERT INTO auth.users (id, raw_user_meta_data) VALUES (${id}, '{"full_name":"t"}'::jsonb)`
  } else {
    await tx`INSERT INTO "Profiles" (id, display_name) VALUES (${id}, 'TEST_1289')`
  }
  if (opts.pending) {
    await tx`UPDATE "Profiles" SET deletion_requested_at = now() - interval '15 days' WHERE id = ${id}`
  }
  return id
}

async function group(tx: Sql | Tx, a: string, b: string | null) {
  const [g] = await tx<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at, base_currency)
    VALUES ('TEST_1289', ${a}, ${b}, now() - interval '30 days', 'twd') RETURNING id`
  const [e] = await tx<{ id: string }[]>`
    INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id)
    VALUES (${g.id}, now() - interval '30 days', NULL, ${a}, ${b})
    RETURNING id`
  await tx`INSERT INTO "GroupBalance" (group_id, balance) VALUES (${g.id}, 0)`
  return { groupId: g.id, epochId: e.id }
}

async function credential(tx: Sql | Tx, groupId: string, userId: string, opts: { deletedDaysAgo?: number; barcode?: string } = {}) {
  const deleted = opts.deletedDaysAgo !== undefined
  const [c] = await tx<{ id: string }[]>`
    INSERT INTO "InvoiceCredentials" (group_id, user_id, barcode, verification_code_encrypted, deleted_at)
    VALUES (${groupId}, ${userId}, ${opts.barcode ?? '/' + randomUUID().slice(0, 7).toUpperCase()},
            ${deleted ? null : CIPHER},
            CASE WHEN ${deleted} THEN now() - make_interval(days => ${opts.deletedDaysAgo ?? 0}) END)
    RETURNING id`
  return c.id
}

async function run(tx: Sql | Tx, groupId: string, credentialId: string | null, userId: string, daysAgo = 1) {
  const [r] = await tx<{ id: string }[]>`
    INSERT INTO "InvoiceImportRuns" (group_id, credential_id, user_id, range_start, range_end, started_at)
    VALUES (${groupId}, ${credentialId}, ${userId}, '2026-01-01', '2026-01-07', now() - make_interval(days => ${daysAgo}))
    RETURNING id`
  return r.id
}

/** The SQLSTATE `body` fails with, run in a savepoint so the tx survives. */
async function sqlstate(tx: Tx, body: (sp: Tx) => Promise<unknown>): Promise<string | undefined> {
  return tx.savepoint(async (sp) => { await body(sp) })
    .then(() => undefined, (e: { code?: string }) => e.code)
}

describe.skipIf(!isLocalDb)('0069 invoice credential retention — local throwaway DB', () => {
  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 1, prepare: false, onnotice: (n) => notices.push(String(n.message)) })
    await pg.begin((tx) => tx.unsafe(MIGRATION))
  })

  afterAll(async () => {
    await pg?.end()
  })

  it('CHECK: a soft-deleted row keeps no ciphertext; a live row has one (23514)', async () => {
    await inRolledBackTx(async (tx) => {
      const u = await profile(tx)
      const { groupId } = await group(tx, u, null)
      expect(await sqlstate(tx, (sp) => sp`
        INSERT INTO "InvoiceCredentials" (group_id, user_id, barcode, verification_code_encrypted, deleted_at)
        VALUES (${groupId}, ${u}, '/AAAAAAA', ${CIPHER}, now())`)).toBe('23514')
      expect(await sqlstate(tx, (sp) => sp`
        INSERT INTO "InvoiceCredentials" (group_id, user_id, barcode, verification_code_encrypted)
        VALUES (${groupId}, ${u}, '/AAAAAAA', NULL)`)).toBe('23514')
      const c = await credential(tx, groupId, u)
      // A soft delete that forgets the ciphertext:
      expect(await sqlstate(tx, (sp) => sp`UPDATE "InvoiceCredentials" SET deleted_at = now() WHERE id = ${c}`)).toBe('23514')
      // …and the shape the actions write:
      expect(await sqlstate(tx, (sp) => sp`
        UPDATE "InvoiceCredentials" SET deleted_at = now(), verification_code_encrypted = NULL WHERE id = ${c}`)).toBeUndefined()
    })
  })

  it('hard-deleting a credential that has runs keeps the runs, credential_id NULL', async () => {
    await inRolledBackTx(async (tx) => {
      const u = await profile(tx)
      const { groupId } = await group(tx, u, null)
      const c = await credential(tx, groupId, u)
      const r = await run(tx, groupId, c, u)
      await tx`DELETE FROM "InvoiceCredentials" WHERE id = ${c}`
      expect(await tx`SELECT credential_id FROM "InvoiceImportRuns" WHERE id = ${r}`).toEqual([{ credential_id: null }])
    })
  })

  it('backfill nulls soft-deleted ciphertext; a second apply is a no-op', async () => {
    await inRolledBackTx(async (tx) => {
      await tx`ALTER TABLE "InvoiceCredentials" DROP CONSTRAINT invoice_credentials_secret_iff_live`
      const u = await profile(tx)
      const { groupId } = await group(tx, u, null)
      const [old] = await tx<{ id: string }[]>`
        INSERT INTO "InvoiceCredentials" (group_id, user_id, barcode, verification_code_encrypted, deleted_at)
        VALUES (${groupId}, ${u}, '/BBBBBBB', ${CIPHER}, now() - interval '3 days') RETURNING id`
      const live = await credential(tx, groupId, u)

      await tx.unsafe(MIGRATION)
      await tx.unsafe(MIGRATION)

      expect(await tx`SELECT verification_code_encrypted AS v FROM "InvoiceCredentials" WHERE id = ${old.id}`).toEqual([{ v: null }])
      expect(await tx`SELECT verification_code_encrypted AS v FROM "InvoiceCredentials" WHERE id = ${live}`).toEqual([{ v: CIPHER }])
      expect(await tx`
        SELECT count(*)::int AS n FROM pg_constraint
        WHERE conname = 'invoice_credentials_secret_iff_live'`).toEqual([{ n: 1 }])
      expect(await tx`
        SELECT c.conname, c.confdeltype FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = '"InvoiceImportRuns"'::regclass AND c.contype = 'f' AND a.attname = 'credential_id'`)
        .toEqual([{ conname: 'InvoiceImportRuns_credential_id_fkey', confdeltype: 'n' }])
      expect(await tx`SELECT count(*)::int AS n FROM cron.job WHERE jobname = 'cleanup-soft-deleted'`).toEqual([{ n: 1 }])
    })
  })

  it('account deletion: left-then-solo user with runs left in the old group (F2)', async () => {
    await inRolledBackTx(async (tx) => {
      // U and P shared G1; U left, taking the credential to solo G2. The run
      // U made in G1 stays there, still pointing at the credential.
      const u = await profile(tx, { pending: true, auth: true })
      const p = await profile(tx, { auth: true })
      const g1 = await group(tx, p, null)
      await tx`
        INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id)
        VALUES (${g1.groupId}, now() - interval '90 days', now() - interval '30 days', ${p}, ${u})`
      const g2 = await group(tx, u, null)
      const c = await credential(tx, g2.groupId, u)
      const r = await run(tx, g1.groupId, c, u, 40)

      // Control: under the pre-0069 FK (NO ACTION) the job can't delete U.
      notices.length = 0
      await tx.savepoint(async (sp) => {
        await sp`ALTER TABLE "InvoiceImportRuns" DROP CONSTRAINT "InvoiceImportRuns_credential_id_fkey"`
        await sp`ALTER TABLE "InvoiceImportRuns" ADD CONSTRAINT "InvoiceImportRuns_credential_id_fkey"
                 FOREIGN KEY (credential_id) REFERENCES "InvoiceCredentials"(id)`
        const [{ n }] = await sp<{ n: number }[]>`SELECT public.process_account_deletions() AS n`
        expect(n).toBe(0)
        expect(notices.some((m) => m.includes('process_account_deletions: failed for') && m.includes('foreign key'))).toBe(true)
        throw ROLLBACK
      }).catch((e) => { if (e !== ROLLBACK) throw e })

      notices.length = 0
      const [{ n }] = await tx<{ n: number }[]>`SELECT public.process_account_deletions() AS n`
      expect(n).toBe(1)
      expect(notices.filter((m) => m.includes('process_account_deletions: failed'))).toEqual([])
      expect(await tx`SELECT 1 FROM auth.users WHERE id = ${u}`).toHaveLength(0)
      expect(await tx`SELECT 1 FROM "InvoiceCredentials" WHERE id = ${c}`).toHaveLength(0)
      expect(await tx`SELECT credential_id FROM "InvoiceImportRuns" WHERE id = ${r}`).toEqual([{ credential_id: null }])
    })
  })

  it('account deletion: a paired user’s credentials are hard-deleted, the partner’s stay', async () => {
    await inRolledBackTx(async (tx) => {
      const v = await profile(tx, { pending: true, auth: true })
      const q = await profile(tx, { auth: true })
      const g = await group(tx, v, q)
      const live = await credential(tx, g.groupId, v)
      const gone = await credential(tx, g.groupId, v, { deletedDaysAgo: 2 })
      const partners = await credential(tx, g.groupId, q)
      const r = await run(tx, g.groupId, live, v)

      notices.length = 0
      const [{ n }] = await tx<{ n: number }[]>`SELECT public.process_account_deletions() AS n`
      expect(n).toBe(1)
      expect(notices.filter((m) => m.includes('process_account_deletions: failed'))).toEqual([])
      expect(await tx`SELECT id FROM "InvoiceCredentials" WHERE id IN (${live}, ${gone}, ${partners})`)
        .toEqual([{ id: partners }])
      expect(await tx`SELECT credential_id, user_id FROM "InvoiceImportRuns" WHERE id = ${r}`)
        .toEqual([{ credential_id: null, user_id: v }])
      // Tombstoned (the run still names them), not stuck.
      expect(await tx`SELECT deletion_requested_at FROM "Profiles" WHERE id = ${v}`)
        .toEqual([{ deletion_requested_at: null }])
    })
  })

  it('cron body: credentials 30 days after soft delete, runs after 1 year, no FK error', async () => {
    const [{ command }] = await pg<{ command: string }[]>`
      SELECT command FROM cron.job WHERE jobname = 'cleanup-soft-deleted'`
    expect(command).toBe(CRON_0069)

    await inRolledBackTx(async (tx) => {
      const u = await profile(tx)
      const { groupId } = await group(tx, u, null)
      const c31 = await credential(tx, groupId, u, { deletedDaysAgo: 31 })
      const c29 = await credential(tx, groupId, u, { deletedDaysAgo: 29 })
      const cLive = await credential(tx, groupId, u)
      const rRecent = await run(tx, groupId, c31, u, 10)   // the formerly FK-violating shape
      const rOld = await run(tx, groupId, cLive, u, 400)
      const rYoung = await run(tx, groupId, cLive, u, 300)

      await tx.unsafe(command)

      expect((await tx`SELECT id FROM "InvoiceCredentials" WHERE group_id = ${groupId} ORDER BY id`).map((x) => x.id).sort())
        .toEqual([c29, cLive].sort())
      expect(await tx`SELECT credential_id FROM "InvoiceImportRuns" WHERE id = ${rRecent}`).toEqual([{ credential_id: null }])
      expect(await tx`SELECT 1 FROM "InvoiceImportRuns" WHERE id = ${rOld}`).toHaveLength(0)
      expect(await tx`SELECT credential_id FROM "InvoiceImportRuns" WHERE id = ${rYoung}`).toEqual([{ credential_id: cLive }])
    })
  })

  describe('actions', () => {
    const made = { profiles: [] as string[] }

    afterAll(async () => {
      if (!made.profiles.length) return
      const ids = made.profiles
      await pg`DELETE FROM "InvoiceImportRuns" WHERE user_id IN ${pg(ids)}`
      await pg`DELETE FROM "InvoiceCredentials" WHERE user_id IN ${pg(ids)}`
      const groups = (await pg<{ id: string }[]>`
        SELECT id FROM "OikosGroups" WHERE member_a IN ${pg(ids)} OR member_b IN ${pg(ids)}`).map((g) => g.id)
      if (groups.length) {
        await pg`DELETE FROM "GroupInvites" WHERE group_id IN ${pg(groups)}`
        await pg`DELETE FROM "GroupEpochs" WHERE group_id IN ${pg(groups)}`
        await pg`DELETE FROM "GroupBalance" WHERE group_id IN ${pg(groups)}`
        await pg`DELETE FROM "OikosGroups" WHERE id IN ${pg(groups)}`
      }
      await pg`DELETE FROM "GroupEpochs" WHERE member_a_id IN ${pg(ids)} OR member_b_id IN ${pg(ids)}`
      await pg`DELETE FROM "Profiles" WHERE id IN ${pg(ids)}`
    })

    async function person() {
      const id = await profile(pg)
      made.profiles.push(id)
      return id
    }
    const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)
    const creds = (userId: string) => pg<{ id: string; group_id: string; live: boolean; has_secret: boolean }[]>`
      SELECT id, group_id, deleted_at IS NULL AS live, verification_code_encrypted IS NOT NULL AS has_secret
      FROM "InvoiceCredentials" WHERE user_id = ${userId} ORDER BY created_at, id`

    it('delete clears the ciphertext; refresh leaves exactly one live row with one', async () => {
      const { createInvoiceCredential, deleteInvoiceCredential, refreshInvoiceCredential } = await import('@/actions/invoice')
      const u = await person()
      await group(pg, u, null)

      const a = await as(u, () => createInvoiceCredential({ barcode: '/DEL0001', verificationCode: 'A1B2C3D4' }))
      expect(a.ok).toBe(true)
      expect(await as(u, () => deleteInvoiceCredential((a as { data: { id: string } }).data.id))).toEqual({ ok: true, data: undefined })

      const b = await as(u, () => createInvoiceCredential({ barcode: '/REF0001', verificationCode: 'A1B2C3D4' }))
      const b2 = await as(u, () => refreshInvoiceCredential((b as { data: { id: string } }).data.id, 'NEWCODE1'))
      const b3 = await as(u, () => refreshInvoiceCredential((b2 as { data: { id: string } }).data.id, 'NEWCODE2'))
      expect(b3.ok).toBe(true)

      const rows = await creds(u)
      expect(rows.map((r) => [r.live, r.has_secret])).toEqual([
        [false, false], // /DEL0001 deleted
        [false, false], // /REF0001 original
        [false, false], // first refresh
        [true, true],   // current
      ])
    })

    it('a double submit binds once and answers the loser with invoice_barcode_already_bound', async () => {
      const { createInvoiceCredential } = await import('@/actions/invoice')
      const u = await person()
      await group(pg, u, null)
      const results = await Promise.all([
        as(u, () => createInvoiceCredential({ barcode: '/DUP0001', verificationCode: 'A1B2C3D4' })),
        as(u, () => createInvoiceCredential({ barcode: '/DUP0001', verificationCode: 'A1B2C3D4' })),
      ])
      expect(results.map((r) => r.ok).sort()).toEqual([false, true])
      expect(results.find((r) => !r.ok)).toEqual({ ok: false, code: 'invoice_barcode_already_bound' })
      expect((await creds(u)).filter((r) => r.live)).toHaveLength(1)
    })

    it('the insert-time 23505 from the real driver maps to invoice_barcode_already_bound', async () => {
      const { createInvoiceCredential } = await import('@/actions/invoice')
      const u = await person()
      const { groupId } = await group(pg, u, null)
      // The other request of a double submit, landing after the pre-check.
      apiHook.afterVerify = async () => { await credential(pg, groupId, u, { barcode: '/RACE001' }) }
      expect(await as(u, () => createInvoiceCredential({ barcode: '/RACE001', verificationCode: 'A1B2C3D4' })))
        .toEqual({ ok: false, code: 'invoice_barcode_already_bound' })
      expect(apiHook.afterVerify).toBeUndefined()
      expect((await creds(u)).filter((r) => r.live)).toHaveLength(1)
    })

    it('leaveGroup moves the leaver’s live credentials only', async () => {
      const { leaveGroup } = await import('@/actions/membership')
      const a = await person()
      const b = await person()
      const g = await group(pg, a, b)
      const live = await credential(pg, g.groupId, b)
      const gone = await credential(pg, g.groupId, b, { deletedDaysAgo: 3 })
      const r = await run(pg, g.groupId, live, b)

      const res = await as(b, () => leaveGroup())
      expect(res.ok).toBe(true)
      const newGroup = (res as { data: { groupId: string } }).data.groupId

      const rows = new Map((await creds(b)).map((x) => [x.id, x.group_id]))
      expect(rows.get(live)).toBe(newGroup)
      expect(rows.get(gone)).toBe(g.groupId)
      // The run stays with the old group (group history).
      expect(await pg`SELECT group_id, credential_id FROM "InvoiceImportRuns" WHERE id = ${r}`)
        .toEqual([{ group_id: g.groupId, credential_id: live }])
    })

    it('removePartner soft-deletes the removed member’s credentials and clears the ciphertext', async () => {
      const { removePartner } = await import('@/actions/membership')
      const a = await person()
      const b = await person()
      const g = await group(pg, a, b)
      const bLive = await credential(pg, g.groupId, b)
      const aLive = await credential(pg, g.groupId, a)

      const res = await as(a, () => removePartner())
      expect(res.ok).toBe(true)

      expect((await creds(b)).filter((x) => x.id === bLive).map((x) => [x.live, x.has_secret])).toEqual([[false, false]])
      expect((await creds(a)).filter((x) => x.id === aLive).map((x) => [x.live, x.has_secret])).toEqual([[true, true]])
    })
  })

  // #1427 — the outing write takes Outings, then the group row (actions/outing.ts).
  // The job used to take the group row, then delete the outings. A third
  // connection watches pg_stat_activity so the job is provably waiting before
  // the app side asks for the group row.
  describe('lock order with outing writes (#1427)', () => {
    const conn = (app: string) => postgres(databaseUrl, {
      max: 1, prepare: false, connection: { application_name: app },
      onnotice: (n) => notices.push(`[${app}] ${n.message}`),
    })

    async function waitLocked(mon: Sql, app: string) {
      for (let i = 0; i < 5000; i++) {
        const [row] = await mon<{ wait_event_type: string | null }[]>`
          SELECT wait_event_type FROM pg_stat_activity WHERE application_name = ${app}`
        if (row?.wait_event_type === 'Lock') return
        await new Promise((r) => setTimeout(r, 5))
      }
      throw new Error(`never blocked: ${app}`)
    }

    async function interleave(tag: string) {
      // A solo user past the grace period, writing to their active outing.
      const s = await profile(pg, { pending: true, auth: true })
      const g = await group(pg, s, null)
      const [o] = await pg<{ id: string }[]>`
        INSERT INTO "Outings" (group_id, epoch_id, created_by, name, currency)
        VALUES (${g.groupId}, ${g.epochId}, ${s}, 'TEST_1427', 'twd') RETURNING id`

      const app = conn(`app_${tag}`)
      const job = conn(`job_${tag}`)
      const mon = conn(`mon_${tag}`)
      notices.length = 0
      let jobResult: Promise<{ ok: boolean; n?: number; code?: string }> = Promise.resolve({ ok: false })
      const appResult = await app.begin(async (t) => {
        await t`SELECT id FROM "Outings" WHERE id = ${o.id} FOR UPDATE`
        jobResult = job<{ n: number }[]>`SELECT public.process_account_deletions() AS n`
          .then((r) => ({ ok: true, n: r[0].n }), (e: { code?: string }) => ({ ok: false, code: e.code }))
        await waitLocked(mon, `job_${tag}`)
        await t`SELECT id FROM "OikosGroups" WHERE id = ${g.groupId} FOR SHARE`
        return 'committed'
      }).catch((e: { code?: string }) => `failed ${e.code}`)
      const jobOut = await jobResult
      const [{ n: left }] = await pg<{ n: number }[]>`SELECT count(*)::int AS n FROM auth.users WHERE id = ${s}`
      await Promise.all([app.end(), job.end(), mon.end()])

      // Leave nothing pending behind for the next run.
      await pg`DELETE FROM "Outings" WHERE id = ${o.id}`
      if (left) {
        await pg`DELETE FROM "GroupEpochs" WHERE group_id = ${g.groupId}`
        await pg`DELETE FROM "GroupBalance" WHERE group_id = ${g.groupId}`
        await pg`DELETE FROM "OikosGroups" WHERE id = ${g.groupId}`
        await pg`DELETE FROM auth.users WHERE id = ${s}`
        await pg`DELETE FROM "Profiles" WHERE id = ${s}`
      }
      return { appResult, jobOut, userDeleted: left === 0, jobNotices: notices.filter((m) => m.startsWith(`[job_${tag}]`)) }
    }

    it('control: 0068’s order deadlocks with the outing write', async () => {
      try {
        await pg.unsafe(FN_0068)
        const out = await interleave('0068')
        const deadlocked =
          out.appResult === 'failed 40P01' ||
          out.jobNotices.some((m) => m.includes('deadlock detected'))
        expect(deadlocked).toBe(true)
      } finally {
        await pg.unsafe(FN_0069)
      }
    })

    it('0069: the job waits on the outing first; both commit, the user is deleted', async () => {
      await pg.unsafe(FN_0069)
      const out = await interleave('0069')
      expect(out.appResult).toBe('committed')
      expect(out.jobOut).toEqual({ ok: true, n: 1 })
      expect(out.jobNotices).toEqual([])
      expect(out.userDeleted).toBe(true)
    })
  })
})
