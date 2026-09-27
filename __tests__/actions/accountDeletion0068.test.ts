import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvLocal } from '../outing/_setup'

// ─── 0068 account-deletion processor against the real dev database (#1377) ──
//
// Everything runs inside ONE transaction that is always rolled back: 0068's
// statements are applied in it, rows are seeded, process_account_deletions()
// runs, the assertions read the result, then the transaction is thrown away.
// Nothing — not the function, not the backfill, not the seed — survives on
// dev. That's also why this can't prove the lock waits: the redefined
// function is invisible to other connections until commit.
//
// If dev already has 0068 applied, the "before" assertions (old function
// leaves the user undeleted) are skipped; the "after" ones still run.
// Excluded from CI with the rest of __tests__/actions/** (vitest.config.ci.ts).
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()
vi.setConfig({ testTimeout: 60_000 })

const { db } = await import('@/lib/db/client')
const { sql } = await import('drizzle-orm')

const ROLLBACK = new Error('rollback')
const TOMBSTONE = '已離開的夥伴'

const migration = readFileSync(resolve(__dirname, '../../drizzle/0068_account_deletion_tombstone.sql'), 'utf-8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean)

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function rows<T>(tx: Tx, q: ReturnType<typeof sql>): Promise<T[]> {
  return (await tx.execute(q)) as unknown as T[]
}

async function seedProfile(tx: Tx, name: string, pendingDeletion: boolean, withAuth = true) {
  const id = randomUUID()
  const requested = pendingDeletion ? sql`now() - interval '15 days'` : sql`NULL`
  if (withAuth) {
    // on_auth_user_created (handle_new_user) inserts the Profiles row.
    await tx.execute(sql`
      INSERT INTO auth.users (id, raw_user_meta_data) VALUES (${id}, jsonb_build_object('name', ${name}::text))`)
    await tx.execute(sql`UPDATE "Profiles" SET deletion_requested_at = ${requested} WHERE id = ${id}`)
  } else {
    await tx.execute(sql`
      INSERT INTO "Profiles" (id, display_name, deletion_requested_at) VALUES (${id}, ${name}, ${requested})`)
  }
  return id
}

async function seedGroup(tx: Tx, a: string, b: string | null) {
  const [g] = await rows<{ id: string }>(tx, sql`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at, base_currency)
    VALUES ('t', ${a}, ${b}, now() - interval '30 days', 'twd') RETURNING id`)
  const [e] = await rows<{ id: string }>(tx, sql`
    INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id)
    VALUES (${g.id}, now() - interval '30 days', NULL, ${a}, ${b})
    RETURNING id`)
  await tx.execute(sql`INSERT INTO "GroupBalance" (group_id, balance) VALUES (${g.id}, 0)`)
  return { groupId: g.id, epochId: e.id }
}

async function authExists(tx: Tx, id: string) {
  return (await rows(tx, sql`SELECT 1 FROM auth.users WHERE id = ${id}`)).length === 1
}

async function profile(tx: Tx, id: string) {
  const [p] = await rows<{ display_name: string; avatar_url: string | null; deletion_requested_at: string | null }>(
    tx, sql`SELECT display_name, avatar_url, deletion_requested_at FROM "Profiles" WHERE id = ${id}`)
  return p ?? null
}

/** Runs `body` in a transaction and always rolls it back. */
async function inRolledBackTx(body: (tx: Tx) => Promise<void>) {
  await expect(db.transaction(async (tx) => {
    await body(tx)
    throw ROLLBACK
  })).rejects.toBe(ROLLBACK)
}

describe('0068 process_account_deletions (#1377)', () => {
  it('a user who left a pair earlier is deleted and tombstoned, not stuck; the boundary is read after the locks', async () => {
    await inRolledBackTx(async (tx) => {
      const [{ applied }] = await rows<{ applied: boolean }>(tx, sql`
        SELECT position('clock_timestamp' in prosrc) > 0 AS applied
        FROM pg_proc WHERE proname = 'process_account_deletions'`)

      // Left-then-solo: U and P shared G1 (its epoch closed when U left; U's
      // name is on an ended outing there). U now sits alone in G2.
      const u = await seedProfile(tx, 'U', true)
      const p = await seedProfile(tx, 'P', false)
      const g1 = await seedGroup(tx, p, null)
      await tx.execute(sql`
        INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id)
        VALUES (${g1.groupId}, now() - interval '60 days', now() - interval '30 days', ${p}, ${u})`)
      const [o] = await rows<{ id: string }>(tx, sql`
        INSERT INTO "Outings" (group_id, epoch_id, created_by, name, currency, status)
        VALUES (${g1.groupId}, ${g1.epochId}, ${u}, '宜蘭', 'twd', 'ended') RETURNING id`)
      const [op] = await rows<{ id: string }>(tx, sql`
        INSERT INTO "OutingParticipants" (outing_id, display_name, profile_id)
        VALUES (${o.id}, 'U 本名', ${u}) RETURNING id`)
      const g2 = await seedGroup(tx, u, null)

      // Paired: V is member_a with partner Q in G3.
      const v = await seedProfile(tx, 'V', true)
      const q = await seedProfile(tx, 'Q', false)
      const g3 = await seedGroup(tx, v, q)

      // Never paired: S alone in G4 — fully deleted, no tombstone.
      const s = await seedProfile(tx, 'S', true)
      await seedGroup(tx, s, null)

      // Already processed before 0068: tombstone with no auth row, still
      // pending, and — like every real tombstone — still referenced (here by
      // an old epoch of G1), which is why the job can't delete it either.
      const t = await seedProfile(tx, TOMBSTONE, true, false)
      await tx.execute(sql`
        INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id)
        VALUES (${g1.groupId}, now() - interval '90 days', now() - interval '60 days', ${p}, ${t})`)

      if (!applied) {
        await tx.execute(sql`SELECT public.process_account_deletions()`)
        // The old function: U's profile delete hits the FK, the whole block
        // rolls back — auth row and pending request both survive.
        expect(await authExists(tx, u)).toBe(true)
        expect((await profile(tx, u))?.deletion_requested_at).not.toBeNull()
        // …and V's tombstone keeps its request (the daily WARNING source).
        expect(await authExists(tx, v)).toBe(false)
        expect((await profile(tx, v))?.deletion_requested_at).not.toBeNull()
      }

      for (const stmt of migration) await tx.execute(sql.raw(stmt))

      // Backfill: already-processed tombstones are cleared.
      expect((await profile(tx, t))?.deletion_requested_at).toBeNull()
      if (!applied) expect((await profile(tx, v))?.deletion_requested_at).toBeNull()

      await tx.execute(sql`SELECT public.process_account_deletions()`)

      // U: account gone, solo group gone, profile kept as a tombstone for G1.
      expect(await authExists(tx, u)).toBe(false)
      expect(await rows(tx, sql`SELECT 1 FROM "OikosGroups" WHERE id = ${g2.groupId}`)).toHaveLength(0)
      expect(await profile(tx, u)).toEqual({ display_name: TOMBSTONE, avatar_url: null, deletion_requested_at: null })
      const [part] = await rows<{ profile_id: string | null; display_name: string }>(tx, sql`
        SELECT profile_id, display_name FROM "OutingParticipants" WHERE id = ${op.id}`)
      expect(part).toEqual({ profile_id: null, display_name: TOMBSTONE })

      // S: nothing references them — profile deleted outright.
      expect(await authExists(tx, s)).toBe(false)
      expect(await profile(tx, s)).toBeNull()

      // V: gone from G3, tombstone no longer pending — whichever function
      // processed it (old one + backfill, or the new one).
      expect(await authExists(tx, v)).toBe(false)
      expect(await profile(tx, v)).toEqual({ display_name: TOMBSTONE, avatar_url: null, deletion_requested_at: null })
      const [g3row] = await rows<{ member_a: string; member_b: string | null }>(tx, sql`
        SELECT member_a, member_b FROM "OikosGroups" WHERE id = ${g3.groupId}`)
      expect(g3row).toEqual({ member_a: q, member_b: null })

      // A fresh paired case run through the new function only: one boundary,
      // read from the clock after the locks.
      const w = await seedProfile(tx, 'W', true)
      const r = await seedProfile(tx, 'R', false)
      const g5 = await seedGroup(tx, w, r)
      const [{ txnow }] = await rows<{ txnow: string }>(tx, sql`SELECT now()::text AS txnow`)
      await tx.execute(sql`SELECT public.process_account_deletions()`)

      const [grp] = await rows<{ member_a: string; member_b: string | null; ces: string }>(tx, sql`
        SELECT member_a, member_b, current_epoch_started_at::text AS ces FROM "OikosGroups" WHERE id = ${g5.groupId}`)
      expect(grp.member_a).toBe(r)
      expect(grp.member_b).toBeNull()
      const epochs = await rows<{ started_at: string; ended_at: string | null; member_a_id: string }>(tx, sql`
        SELECT started_at::text, ended_at::text, member_a_id FROM "GroupEpochs"
        WHERE group_id = ${g5.groupId} ORDER BY started_at`)
      expect(epochs).toHaveLength(2)
      // One boundary for all three, and it is clock time, not the tx start.
      expect(epochs[0].ended_at).toBe(epochs[1].started_at)
      expect(grp.ces).toBe(epochs[1].started_at)
      const [{ later }] = await rows<{ later: boolean }>(tx, sql`
        SELECT ${epochs[1].started_at}::timestamptz > ${txnow}::timestamptz AS later`)
      expect(later).toBe(true)
      expect(await profile(tx, w)).toEqual({ display_name: TOMBSTONE, avatar_url: null, deletion_requested_at: null })
      expect(await authExists(tx, w)).toBe(false)
    })
  })
})
