import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql } from 'postgres'
import { loadEnvLocal } from '../outing/_setup'

// ─── 0071: account deletion re-reads the user's groups after its locks (#1433) ─
// ─── 0074: …and takes the user's Profiles row before that re-read (#1449) ────
//
// LOCAL THROWAWAY DATABASE ONLY. This file commits the current function
// (0074's), swaps in 0069's or 0071's for the control runs, and lets the
// deletion job process every pending user. It skips itself unless
// DATABASE_URL points at localhost — never run it against dev or prod.
//
// Database: postgres:17 plus the Supabase stand-ins (see PR #1445's
// description), then `drizzle-kit migrate` through 0074 (the app code calls
// 0074's profile_is_live).
//
//   DATABASE_URL=postgres://postgres:<pw>@localhost:<port>/postgres \
//     npx vitest run __tests__/actions/accountDeletionRescan0071.test.ts
//
// What it proves, with the real leaveGroup / acceptInvite / createInvite:
//   1. #1433: the user leaves a pair while the job waits on the old group's
//      lock. Under 0069 the new solo group is left behind (orphaned, the
//      profile a tombstone); under 0071 it is deleted, no WARNING.
//   2. The same shape through acceptInvite: under 0069 the deleted user stays
//      seated in the partner's group; under 0071 they are removed from it.
//   3. No 40P01 in either order (app first, job first) against leaveGroup,
//      acceptInvite and an outing write.
//
// The window is made deterministic with a hook right after the action's
// lockForEpochClose: the job is started there, and a third connection watches
// pg_stat_activity until the job is waiting on a lock.
//
// #1449 (the describe block at the end), a user with no ledger:
//   4. acceptInvite / createGroup hold the user's Profiles row when the job
//      starts. Under 0071 the job's re-read misses the uncommitted ledger and
//      its DELETE "Profiles" waits; the action commits and the profile becomes
//      a tombstone seated in that ledger. Under 0074 the job waits on the row
//      BEFORE its re-read, sees the ledger, and removes the user from it.
//   5. Job first, user still named in a past chapter (so the job keeps a
//      tombstone): the action waits on the row, then fails `profile_not_found`
//      (profile_is_live) instead of seating the tombstone.
// ──────────────────────────────────────────────────────────────────────────────

loadEnvLocal()
vi.setConfig({ testTimeout: 60_000 })

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
// Runs once, right after the action holds its locks (group locks, and for
// acceptInvite / createGroup the user's Profiles row).
const lockHook: { afterLock?: () => Promise<void> } = {}
const runHook = async () => {
  const hook = lockHook.afterLock
  lockHook.afterLock = undefined
  if (hook) await hook()
}
vi.mock('@/lib/db/queries/epoch', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db/queries/epoch')>()
  return {
    ...real,
    lockForEpochClose: async (...args: Parameters<typeof real.lockForEpochClose>) => {
      const result = await real.lockForEpochClose(...args)
      await runHook()
      return result
    },
    lockProfileForGroupCreate: async (...args: Parameters<typeof real.lockProfileForGroupCreate>) => {
      const result = await real.lockProfileForGroupCreate(...args)
      await runHook()
      return result
    },
  }
})

const postgres = (await import('postgres')).default

const fnSection = (file: string) => readFileSync(resolve(__dirname, '../../drizzle', file), 'utf-8')
  .split('--> statement-breakpoint')
  .find((s) => s.includes('CREATE OR REPLACE FUNCTION public.process_account_deletions'))!
const FN_0069 = fnSection('0069_invoice_credential_retention.sql')
const FN_0071 = fnSection('0071_account_deletion_rescan.sql')
// The current definition; every control run restores it.
const FN_0074 = fnSection('0074_account_deletion_profile_lock.sql')

const TOMBSTONE = '已離開的夥伴'
const notices: string[] = []
let pg: Sql

const conn = (app: string) => postgres(databaseUrl, {
  max: 1, prepare: false, connection: { application_name: app },
  onnotice: (n) => notices.push(`[${app}] ${n.message}`),
})

async function profile(opts: { pending?: boolean } = {}) {
  const id = randomUUID()
  // on_auth_user_created (handle_new_user) inserts the Profiles row.
  await pg`INSERT INTO auth.users (id, raw_user_meta_data) VALUES (${id}, '{"full_name":"TEST_1433"}'::jsonb)`
  if (opts.pending) {
    await pg`UPDATE "Profiles" SET deletion_requested_at = now() - interval '15 days' WHERE id = ${id}`
  }
  return id
}

async function group(a: string, b: string | null) {
  const [g] = await pg<{ id: string }[]>`
    INSERT INTO "OikosGroups" (name, member_a, member_b, current_epoch_started_at, base_currency)
    VALUES ('TEST_1433', ${a}, ${b}, now() - interval '30 days', 'twd') RETURNING id`
  const [e] = await pg<{ id: string }[]>`
    INSERT INTO "GroupEpochs" (group_id, started_at, ended_at, member_a_id, member_b_id)
    VALUES (${g.id}, now() - interval '30 days', NULL, ${a}, ${b})
    RETURNING id`
  await pg`INSERT INTO "GroupBalance" (group_id, balance) VALUES (${g.id}, 0)`
  return { groupId: g.id, epochId: e.id }
}

async function waitLocked(mon: Sql, app: string) {
  for (let i = 0; i < 5000; i++) {
    const [row] = await mon<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE application_name = ${app} AND wait_event_type = 'Lock'`
    if (row.n > 0) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`never blocked: ${app}`)
}

/** SQLSTATE of an error, looking through Drizzle's wrapper. */
function codeOf(e: unknown): string | undefined {
  let cur = e as { code?: unknown; cause?: unknown } | undefined
  for (let i = 0; cur && i < 5; i++) {
    if (typeof cur.code === 'string' && /^[0-9A-Z]{5}$/.test(cur.code)) return cur.code
    cur = cur.cause as typeof cur
  }
  return undefined
}

type Settled = { ok: true; value: unknown } | { ok: false; code: string | undefined; message: string }
const settle = (p: Promise<unknown>): Promise<Settled> =>
  p.then((value) => ({ ok: true as const, value }), (e: Error) => ({ ok: false as const, code: codeOf(e), message: String(e?.message) }))

/** The job's result, with the job's own notices. */
async function runJobWhileAppHoldsLocks(tag: string, app: () => Promise<unknown>) {
  const job = conn(`job_${tag}`)
  const mon = conn(`mon_${tag}`)
  notices.length = 0
  let jobResult: Promise<Settled> = Promise.resolve({ ok: false, code: undefined, message: 'not started' })
  lockHook.afterLock = async () => {
    jobResult = settle(job<{ n: number }[]>`SELECT public.process_account_deletions() AS n`.then((r) => r[0].n))
    await waitLocked(mon, `job_${tag}`)
  }
  const appResult = await settle(app())
  const jobOut = await jobResult
  await Promise.all([job.end(), mon.end()])
  return { appResult, jobOut, jobNotices: notices.filter((m) => m.startsWith(`[job_${tag}]`)) }
}

/** Job first: it runs in an open transaction; the app starts and must wait on it. */
async function runAppWhileJobHoldsLocks(tag: string, app: () => Promise<unknown>, appName = 'postgres.js') {
  const job = conn(`job_${tag}`)
  const mon = conn(`mon_${tag}`)
  notices.length = 0
  let appResult: Promise<Settled> = Promise.resolve({ ok: false, code: undefined, message: 'not started' })
  const jobOut = await settle(job.begin(async (t) => {
    const [r] = await t<{ n: number }[]>`SELECT public.process_account_deletions() AS n`
    appResult = settle(app())
    // 'postgres.js': the actions' pool (default application_name).
    await waitLocked(mon, appName)
    return r.n
  }))
  const app_ = await appResult
  await Promise.all([job.end(), mon.end()])
  return { appResult: app_, jobOut, jobNotices: notices.filter((m) => m.startsWith(`[job_${tag}]`)) }
}

const as = <T>(userId: string, fn: () => Promise<T>) => viewerStore.run(userId, fn)

/** Server actions return { ok: false, code } for expected errors; anything else throws. */
async function unwrapped<T>(p: Promise<{ ok: true; data: T } | { ok: false; code: string }>): Promise<T> {
  const r = await p
  if (!r.ok) throw Object.assign(new Error(r.code), { actionCode: r.code })
  return r.data
}

const authExists = async (id: string) => (await pg`SELECT 1 FROM auth.users WHERE id = ${id}`).length === 1
const groupRow = async (id: string) =>
  (await pg<{ member_a: string; member_b: string | null }[]>`
    SELECT member_a, member_b FROM "OikosGroups" WHERE id = ${id}`)[0] ?? null
const profileRow = async (id: string) =>
  (await pg<{ display_name: string; deletion_requested_at: Date | null }[]>`
    SELECT display_name, deletion_requested_at FROM "Profiles" WHERE id = ${id}`)[0] ?? null

describe.skipIf(!isLocalDb)('0071/0074 process_account_deletions re-reads after its locks (#1433, #1449) — local throwaway DB', () => {
  beforeAll(async () => {
    pg = postgres(databaseUrl, { max: 1, prepare: false, connection: { application_name: 'main_1433' } })
    await pg.unsafe(FN_0074)
  })

  afterAll(async () => {
    await pg?.unsafe(FN_0074)
    await pg?.end()
  })

  // U is member_b of G with partner P; U's deletion is due. U leaves while
  // the job waits on G's lock.
  async function leaveDuringJob(tag: string) {
    const { leaveGroup } = await import('@/actions/membership')
    const p = await profile()
    const u = await profile({ pending: true })
    const g = await group(p, u)
    let newGroupId = ''
    const out = await runJobWhileAppHoldsLocks(tag, async () => {
      const r = await unwrapped(as(u, () => leaveGroup()))
      newGroupId = r.groupId
      return r
    })
    return { ...out, u, p, g, newGroupId }
  }

  it('control: under 0069 the solo group a concurrent leave creates is left behind', async () => {
    try {
      await pg.unsafe(FN_0069)
      const out = await leaveDuringJob('leave_0069')
      expect(out.appResult.ok).toBe(true)
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(out.jobNotices).toEqual([])
      expect(await authExists(out.u)).toBe(false)
      // The orphan: a solo group whose only member is the tombstone.
      expect(await groupRow(out.newGroupId)).toEqual({ member_a: out.u, member_b: null })
      expect((await profileRow(out.u))?.display_name).toBe(TOMBSTONE)
    } finally {
      await pg.unsafe(FN_0074)
    }
  })

  it('0071: the new solo group is deleted with the user; no WARNING, no deadlock', async () => {
    const out = await leaveDuringJob('leave_0071')
    expect(out.appResult.ok).toBe(true)
    expect(out.jobOut).toEqual({ ok: true, value: 1 })
    expect(out.jobNotices).toEqual([])
    expect(await authExists(out.u)).toBe(false)
    expect(out.newGroupId).not.toBe('')
    expect(await groupRow(out.newGroupId)).toBeNull()
    expect(await pg`SELECT 1 FROM "GroupEpochs" WHERE group_id = ${out.newGroupId}`).toHaveLength(0)
    // The old group is P's solo ledger; U stays named in its closed chapter,
    // so the profile is a tombstone, no longer pending.
    expect(await groupRow(out.g.groupId)).toEqual({ member_a: out.p, member_b: null })
    expect(await profileRow(out.u)).toEqual({ display_name: TOMBSTONE, deletion_requested_at: null })
    expect(await pg`SELECT 1 FROM "OikosGroups" WHERE member_a = ${out.u} OR member_b = ${out.u}`).toHaveLength(0)
  })

  // U sits alone in S0 and accepts P's invite into H while the job waits on
  // S0 (acceptInvite locks H and S0).
  async function acceptDuringJob(tag: string) {
    const { acceptInvite, createInvite } = await import('@/actions/invite')
    const p = await profile()
    const u = await profile({ pending: true })
    const h = await group(p, null)
    const s0 = await group(u, null)
    const url = await unwrapped(as(p, () => createInvite()))
    const token = url.slice(url.lastIndexOf('/invite/') + '/invite/'.length)
    const out = await runJobWhileAppHoldsLocks(tag, () => unwrapped(as(u, () => acceptInvite(token))))
    return { ...out, u, p, h, s0 }
  }

  it('control: under 0069 a user who accepts an invite while the job waits stays seated in it', async () => {
    try {
      await pg.unsafe(FN_0069)
      const out = await acceptDuringJob('accept_0069')
      expect(out.appResult.ok).toBe(true)
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(await authExists(out.u)).toBe(false)
      expect(await groupRow(out.h.groupId)).toEqual({ member_a: out.p, member_b: out.u })
    } finally {
      await pg.unsafe(FN_0074)
    }
  })

  it('0071: acceptInvite first — the job waits, then removes the user from the group they joined', async () => {
    const out = await acceptDuringJob('accept_0071')
    expect(out.appResult.ok).toBe(true)
    expect(out.jobOut).toEqual({ ok: true, value: 1 })
    expect(out.jobNotices).toEqual([])
    expect(await authExists(out.u)).toBe(false)
    expect(await groupRow(out.s0.groupId)).toBeNull()
    expect(await groupRow(out.h.groupId)).toEqual({ member_a: out.p, member_b: null })
    const open = await pg<{ member_a_id: string; member_b_id: string | null }[]>`
      SELECT member_a_id, member_b_id FROM "GroupEpochs" WHERE group_id = ${out.h.groupId} AND ended_at IS NULL`
    expect(open).toEqual([{ member_a_id: out.p, member_b_id: null }])
  })

  it('0071: job first vs leaveGroup — the leave waits, then fails as not a member; no 40P01', async () => {
    const { leaveGroup } = await import('@/actions/membership')
    const p = await profile()
    const u = await profile({ pending: true })
    const g = await group(p, u)
    const out = await runAppWhileJobHoldsLocks('leave_jobfirst', () => unwrapped(as(u, () => leaveGroup())))
    expect(out.jobOut).toEqual({ ok: true, value: 1 })
    expect(out.jobNotices).toEqual([])
    expect(out.appResult.ok).toBe(false)
    expect(out.appResult.ok === false && out.appResult.code).not.toBe('40P01')
    expect(out.appResult.ok === false && out.appResult.message).toContain('only_member_b_can_leave')
    expect(await authExists(u)).toBe(false)
    expect(await groupRow(g.groupId)).toEqual({ member_a: p, member_b: null })
    expect(await pg`SELECT 1 FROM "OikosGroups" WHERE member_a = ${u} OR member_b = ${u}`).toHaveLength(0)
  })

  it('0071: job first vs acceptInvite — the accept waits, then fails on the deleted profile; no 40P01', async () => {
    const { acceptInvite, createInvite } = await import('@/actions/invite')
    const p = await profile()
    const u = await profile({ pending: true })
    const h = await group(p, null)
    const s0 = await group(u, null)
    const url = await unwrapped(as(p, () => createInvite()))
    const token = url.slice(url.lastIndexOf('/invite/') + '/invite/'.length)
    const out = await runAppWhileJobHoldsLocks('accept_jobfirst', () => unwrapped(as(u, () => acceptInvite(token))))
    expect(out.jobOut).toEqual({ ok: true, value: 1 })
    expect(out.jobNotices).toEqual([])
    expect(out.appResult.ok).toBe(false)
    expect(out.appResult.ok === false && out.appResult.code).not.toBe('40P01')
    expect(await authExists(u)).toBe(false)
    expect(await profileRow(u)).toBeNull()
    expect(await groupRow(s0.groupId)).toBeNull()
    expect(await groupRow(h.groupId)).toEqual({ member_a: p, member_b: null })
  })

  // #1427's shape: the outing write takes Outings, then the group row.
  describe('outing write (#1427 order kept)', () => {
    async function soloWithOuting() {
      const s = await profile({ pending: true })
      const g = await group(s, null)
      const [o] = await pg<{ id: string }[]>`
        INSERT INTO "Outings" (group_id, epoch_id, created_by, name, currency)
        VALUES (${g.groupId}, ${g.epochId}, ${s}, 'TEST_1433', 'twd') RETURNING id`
      return { s, g, outingId: o.id }
    }

    it('app first: the job waits on the outing; both commit, the user is deleted', async () => {
      const { s, g, outingId } = await soloWithOuting()
      const app = conn('app_outing_appfirst')
      const job = conn('job_outing_appfirst')
      const mon = conn('mon_outing_appfirst')
      notices.length = 0
      let jobResult: Promise<Settled> = Promise.resolve({ ok: false, code: undefined, message: 'not started' })
      const appResult = await settle(app.begin(async (t) => {
        await t`SELECT id FROM "Outings" WHERE id = ${outingId} FOR UPDATE`
        jobResult = settle(job<{ n: number }[]>`SELECT public.process_account_deletions() AS n`.then((r) => r[0].n))
        await waitLocked(mon, 'job_outing_appfirst')
        await t`SELECT id FROM "OikosGroups" WHERE id = ${g.groupId} FOR SHARE`
        return 'committed'
      }))
      const jobOut = await jobResult
      await Promise.all([app.end(), job.end(), mon.end()])
      expect(appResult).toEqual({ ok: true, value: 'committed' })
      expect(jobOut).toEqual({ ok: true, value: 1 })
      expect(notices.filter((m) => m.startsWith('[job_'))).toEqual([])
      expect(await authExists(s)).toBe(false)
      expect(await groupRow(g.groupId)).toBeNull()
    })

    it('job first: the outing write waits, then finds nothing; no 40P01', async () => {
      const { s, g, outingId } = await soloWithOuting()
      const app = conn('app_outing_jobfirst')
      const out = await runAppWhileJobHoldsLocks('outing_jobfirst', () => app.begin(async (t) => {
        const o = await t`SELECT id FROM "Outings" WHERE id = ${outingId} FOR UPDATE`
        const grp = await t`SELECT id FROM "OikosGroups" WHERE id = ${g.groupId} FOR SHARE`
        return [o.length, grp.length]
      }).finally(() => app.end()), 'app_outing_jobfirst')
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(out.jobNotices).toEqual([])
      expect(out.appResult).toEqual({ ok: true, value: [0, 0] })
      expect(await authExists(s)).toBe(false)
    })
  })

  // ─── #1449 ────────────────────────────────────────────────────────────────
  describe('0074: Profiles row before the re-read; liveness after the lock (#1449)', () => {
    /**
     * Until `app` (an application_name) waits on a heavyweight lock while
     * holding the tuple lock of `userId`'s Profiles row: proof that it is
     * parked on that row, not on a group or chapter row.
     */
    async function waitOnProfileRow(mon: Sql, app: string, userId: string) {
      for (let i = 0; i < 2000; i++) {
        const [row] = await mon<{ n: number }[]>`
          SELECT count(*)::int AS n
          FROM pg_stat_activity a
          JOIN pg_locks t ON t.pid = a.pid AND t.locktype = 'tuple'
            AND t.relation = '"Profiles"'::regclass
          WHERE a.application_name = ${app} AND a.wait_event_type = 'Lock'
            AND EXISTS (SELECT 1 FROM pg_locks w WHERE w.pid = a.pid AND NOT w.granted)
            AND EXISTS (SELECT 1 FROM "Profiles" p WHERE p.id = ${userId} AND p.ctid = format('(%s,%s)', t.page, t.tuple)::tid)`
        if (row.n > 0) return
        await new Promise((r) => setTimeout(r, 5))
      }
      throw new Error(`never parked on the Profiles row: ${app}`)
    }

    /** Like runJobWhileAppHoldsLocks, but asserts the job waits on U's Profiles row. */
    async function runJobWhileAppHoldsProfile(tag: string, u: string, app: () => Promise<unknown>) {
      const job = conn(`job_${tag}`)
      const mon = conn(`mon_${tag}`)
      notices.length = 0
      let jobResult: Promise<Settled> = Promise.resolve({ ok: false, code: undefined, message: 'not started' })
      lockHook.afterLock = async () => {
        jobResult = settle(job<{ n: number }[]>`SELECT public.process_account_deletions() AS n`.then((r) => r[0].n))
        await waitOnProfileRow(mon, `job_${tag}`, u)
      }
      const appResult = await settle(app())
      const jobOut = await jobResult
      await Promise.all([job.end(), mon.end()])
      return { appResult, jobOut, jobNotices: notices.filter((m) => m.startsWith(`[job_${tag}]`)) }
    }

    /** Like runAppWhileJobHoldsLocks, but asserts the action waits on U's Profiles row. */
    async function runAppWhileJobHoldsProfile(tag: string, u: string, app: () => Promise<unknown>) {
      const job = conn(`job_${tag}`)
      const mon = conn(`mon_${tag}`)
      notices.length = 0
      let appResult: Promise<Settled> = Promise.resolve({ ok: false, code: undefined, message: 'not started' })
      const jobOut = await settle(job.begin(async (t) => {
        const [r] = await t<{ n: number }[]>`SELECT public.process_account_deletions() AS n`
        appResult = settle(app())
        await waitOnProfileRow(mon, 'postgres.js', u)
        return r.n
      }))
      const app_ = await appResult
      await Promise.all([job.end(), mon.end()])
      return { appResult: app_, jobOut, jobNotices: notices.filter((m) => m.startsWith(`[job_${tag}]`)) }
    }

    const groupsOf = (u: string) => pg`SELECT id FROM "OikosGroups" WHERE member_a = ${u} OR member_b = ${u}`

    async function invite(p: string) {
      const { createInvite } = await import('@/actions/invite')
      const url = await unwrapped(as(p, () => createInvite()))
      return url.slice(url.lastIndexOf('/invite/') + '/invite/'.length)
    }

    // U has no ledger and their deletion is due; P has a solo ledger H and
    // invites U. U's accept holds U's Profiles row when the job starts.
    async function acceptHoldingProfile(tag: string) {
      const { acceptInvite } = await import('@/actions/invite')
      const p = await profile()
      const u = await profile({ pending: true })
      const h = await group(p, null)
      const token = await invite(p)
      const out = await runJobWhileAppHoldsProfile(tag, u, () => unwrapped(as(u, () => acceptInvite(token))))
      return { ...out, u, p, h }
    }

    it('control: under 0071 an accept committing after the re-read seats the tombstone in the partner\'s ledger', async () => {
      try {
        await pg.unsafe(FN_0071)
        const out = await acceptHoldingProfile('accept_hold_0071')
        expect(out.appResult.ok).toBe(true)
        expect(out.jobOut).toEqual({ ok: true, value: 1 })
        expect(out.jobNotices).toEqual([])
        expect(await authExists(out.u)).toBe(false)
        expect(await groupRow(out.h.groupId)).toEqual({ member_a: out.p, member_b: out.u })
        expect((await profileRow(out.u))?.display_name).toBe(TOMBSTONE)
      } finally {
        await pg.unsafe(FN_0074)
      }
    })

    it('1. accept first: the job waits on the Profiles row, then removes the user from the ledger they joined', async () => {
      await pg.unsafe(FN_0074)
      const out = await acceptHoldingProfile('accept_hold_0074')
      expect(out.appResult.ok).toBe(true)
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(out.jobNotices).toEqual([])
      expect(await authExists(out.u)).toBe(false)
      expect(await groupRow(out.h.groupId)).toEqual({ member_a: out.p, member_b: null })
      const open = await pg<{ member_a_id: string; member_b_id: string | null }[]>`
        SELECT member_a_id, member_b_id FROM "GroupEpochs" WHERE group_id = ${out.h.groupId} AND ended_at IS NULL`
      expect(open).toEqual([{ member_a_id: out.p, member_b_id: null }])
      expect(await groupsOf(out.u)).toHaveLength(0)
      // Still named in the closed duo chapter, so a tombstone, no longer pending.
      expect(await profileRow(out.u)).toEqual({ display_name: TOMBSTONE, deletion_requested_at: null })
    })

    // U has no ledger and their deletion is due; U's createGroup holds U's
    // Profiles row when the job starts.
    async function createHoldingProfile(tag: string) {
      const { createGroup } = await import('@/actions/group')
      const u = await profile({ pending: true })
      let newGroupId = ''
      const out = await runJobWhileAppHoldsProfile(tag, u, async () => {
        const g = await unwrapped(as(u, () => createGroup('TEST_1449')))
        newGroupId = (g as { id: string }).id
        return g
      })
      return { ...out, u, newGroupId }
    }

    it('control: under 0071 a createGroup committing after the re-read leaves a tombstone-owned orphan ledger', async () => {
      try {
        await pg.unsafe(FN_0071)
        const out = await createHoldingProfile('create_hold_0071')
        expect(out.appResult.ok).toBe(true)
        expect(out.jobOut).toEqual({ ok: true, value: 1 })
        expect(out.jobNotices).toEqual([])
        expect(await authExists(out.u)).toBe(false)
        expect(await groupRow(out.newGroupId)).toEqual({ member_a: out.u, member_b: null })
        expect((await profileRow(out.u))?.display_name).toBe(TOMBSTONE)
      } finally {
        await pg.unsafe(FN_0074)
      }
    })

    it('2. createGroup first: the job waits on the Profiles row, then deletes the new ledger with the user', async () => {
      await pg.unsafe(FN_0074)
      const out = await createHoldingProfile('create_hold_0074')
      expect(out.appResult.ok).toBe(true)
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(out.jobNotices).toEqual([])
      expect(out.newGroupId).not.toBe('')
      expect(await authExists(out.u)).toBe(false)
      expect(await groupRow(out.newGroupId)).toBeNull()
      expect(await pg`SELECT 1 FROM "GroupEpochs" WHERE group_id = ${out.newGroupId}`).toHaveLength(0)
      expect(await groupsOf(out.u)).toHaveLength(0)
      // Nothing else names U: hard-deleted.
      expect(await profileRow(out.u)).toBeNull()
    })

    // U was P's partner until P removed them (removePartner creates no ledger
    // for U), so U is still named in G's closed chapter and the job keeps a
    // tombstone. Then U's deletion comes due.
    async function removedPartner() {
      const { removePartner } = await import('@/actions/membership')
      const p = await profile()
      const u = await profile()
      const g = await group(p, u)
      await unwrapped(as(p, () => removePartner()))
      await pg`UPDATE "Profiles" SET deletion_requested_at = now() - interval '15 days' WHERE id = ${u}`
      expect(await groupsOf(u)).toHaveLength(0)
      expect(await pg`SELECT 1 FROM "GroupEpochs" WHERE group_id = ${g.groupId} AND member_b_id = ${u}`).toHaveLength(1)
      return { p, u, g }
    }

    async function expectTombstoneOutsideEveryLedger(u: string) {
      expect(await authExists(u)).toBe(false)
      expect(await profileRow(u)).toEqual({ display_name: TOMBSTONE, deletion_requested_at: null })
      expect(await groupsOf(u)).toHaveLength(0)
    }

    it('3a. job first vs acceptInvite (user with history): the accept waits, then fails profile_not_found', async () => {
      await pg.unsafe(FN_0074)
      const { acceptInvite } = await import('@/actions/invite')
      const { p, u, g } = await removedPartner()
      const token = await invite(p)
      const out = await runAppWhileJobHoldsProfile('accept_jobfirst_history', u,
        () => unwrapped(as(u, () => acceptInvite(token))))
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(out.jobNotices).toEqual([])
      expect(out.appResult).toMatchObject({ ok: false, message: 'profile_not_found' })
      await expectTombstoneOutsideEveryLedger(u)
      expect(await groupRow(g.groupId)).toEqual({ member_a: p, member_b: null })
      // The invite is still open: the accept rolled back.
      expect(await pg`
        SELECT 1 FROM "GroupInvites" WHERE group_id = ${g.groupId} AND accepted_at IS NOT NULL`).toHaveLength(0)
    })

    it('3b. job first vs createGroup (user with history): createGroup waits, then fails profile_not_found', async () => {
      await pg.unsafe(FN_0074)
      const { createGroup } = await import('@/actions/group')
      const { u } = await removedPartner()
      const out = await runAppWhileJobHoldsProfile('create_jobfirst_history', u,
        () => unwrapped(as(u, () => createGroup('TEST_1449'))))
      expect(out.jobOut).toEqual({ ok: true, value: 1 })
      expect(out.jobNotices).toEqual([])
      expect(out.appResult).toMatchObject({ ok: false, message: 'profile_not_found' })
      await expectTombstoneOutsideEveryLedger(u)
    })

    it('3c. profile_is_live: SECURITY DEFINER, empty search_path, executable by futari_app only', async () => {
      const [fn] = await pg<{ secdef: boolean; config: string[] | null; volatile: string }[]>`
        SELECT prosecdef AS secdef, proconfig AS config, provolatile AS volatile
        FROM pg_proc WHERE oid = 'public.profile_is_live(uuid)'::regprocedure`
      expect(fn).toEqual({ secdef: true, config: ['search_path=""'], volatile: 's' })
      const privs = await pg<{ role: string; can: boolean }[]>`
        SELECT r AS role, has_function_privilege(r, 'public.profile_is_live(uuid)', 'EXECUTE') AS can
        FROM unnest(ARRAY['anon', 'authenticated', 'futari_app']) AS r`
      expect(privs).toEqual([
        { role: 'anon', can: false },
        { role: 'authenticated', can: false },
        { role: 'futari_app', can: true },
      ])
      // No grant to PUBLIC (grantee 0) survives.
      expect(await pg`
        SELECT 1 FROM pg_proc, aclexplode(coalesce(proacl, acldefault('f', proowner))) a
        WHERE oid = 'public.profile_is_live(uuid)'::regprocedure AND a.grantee = 0`).toHaveLength(0)
      // And what it answers.
      const live = await profile()
      expect(await pg`SELECT public.profile_is_live(${live}::uuid) AS v`).toEqual([{ v: true }])
      expect(await pg`SELECT public.profile_is_live(${randomUUID()}::uuid) AS v`).toEqual([{ v: false }])
    })
  })
})
