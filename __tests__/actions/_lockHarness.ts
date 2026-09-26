// ─── #1444 — shared harness for the #1290 lock-order integration tests ────
//
// epochCloser.lockOrder.test.ts, trip.epochLock.test.ts and
// moneyRowChapterScope.test.ts each force a specific lock-wait interleaving
// between real Postgres connections and drive it forward statement by
// statement. This file is the one copy of that machinery.
//
// What the flake actually is (found in PR #1448 review, superseding the
// theory this file shipped with first): it is not the wait detection below.
// A verifier ran a plpgsql loop comparing consecutive `clock_timestamp()`
// reads on the same Docker Desktop VM these tests run against, and found the
// VM's wall clock steps *backwards* by ~0.4–0.5s roughly every 10s (15
// backward steps observed in 150s) — a known Docker Desktop / host
// sleep-wake clock-drift correction, not anything these tests or the product
// code control. Every observed failure fell inside a test run whose window
// overlapped one of those steps; runs whose window was clear of a step were
// clean. The three suites' "boundary vs. row timestamp" assertions
// (`writerRowBefore`, `editedRowBeforeOpenChapter`, `before` in
// `writerNowVsBoundary`) compare a `now()`/`created_at` read from one backend
// against a `clock_timestamp()` boundary read from another — two independent
// reads of the *same* wall clock, taken moments apart. If that clock steps
// backwards in between, the comparison can come out false even though every
// lock actually serialized exactly as designed: the failure reads as
// `expected false to be true` on the `now < started_at`-shaped check, and a
// rerun (which won't hit the same clock step) passes. This is a property of
// the host running Postgres, not of the interleaving or the product code.
//
// Why this file still checks three signals instead of one (still worth
// having, just not what fixes the above): the old per-file `waitBlockedBy`
// polled only `${blockerPid} = ANY(pg_blocking_pids(pid))`, and
// `waitLockWaiters(Or)` polled only `pg_stat_activity.wait_event_type =
// 'Lock'`. Each of those can update a beat before or after the backend is
// actually parked waiting for the lock table entry the test's next step
// depends on — `pg_blocking_pids()` walks the lock manager's wait queue,
// which is populated slightly after `wait_event_type` flips to `'Lock'`, and
// a `pg_locks` row for the waiter can itself lag one poll tick behind either.
// Requiring `pg_stat_activity.wait_event_type = 'Lock'`, `blockerPid` present
// in `pg_blocking_pids(pid)`, and a `granted = false` row for that pid in
// `pg_locks` to all agree makes the *lock-wait* precondition itself more
// trustworthy, and turns a timeout into a loud `pg_stat_activity` /
// `pg_locks` dump instead of a silent `false`-when-it-should-be-blocked. It
// is a real robustness improvement on its own terms — it just isn't the
// mechanism behind the clock-step flake above, which no amount of more
// careful lock-wait polling can fix: both reads it's comparing already
// happened after their respective locks were correctly held and released.

import type postgres from 'postgres'
type Sql = ReturnType<typeof postgres>

type Step = { fn: (t: Sql) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }

/**
 * One transaction on `conn`, driven statement by statement. `run` queues a
 * statement and resolves with its result; `commit` ends the transaction. A
 * failing step rolls the transaction back (and rejects `done`).
 */
export async function openTx(conn: Sql) {
  const queue: Step[] = []
  let wake: (() => void) | null = null
  let finished = false
  let setPid!: (pid: number) => void
  const pidP = new Promise<number>((r) => { setPid = r })
  const done = conn.begin(async (t) => {
    const [{ pid }] = await t`SELECT pg_backend_pid() AS pid`
    setPid(pid as number)
    for (;;) {
      while (queue.length === 0 && !finished) await new Promise<void>((r) => { wake = r })
      const step = queue.shift()
      if (!step) return
      try {
        step.resolve(await step.fn(t as unknown as Sql))
      } catch (e) {
        step.reject(e)
        throw e
      }
    }
  })
  done.catch(() => {})
  const pid = await pidP
  const poke = () => { const w = wake; wake = null; w?.() }
  return {
    pid,
    run<T>(fn: (t: Sql) => Promise<T>): Promise<T> {
      const p = new Promise<T>((resolve, reject) => {
        queue.push({ fn, resolve: resolve as (v: unknown) => void, reject })
      })
      poke()
      return p
    },
    async commit() {
      finished = true
      poke()
      await done
    },
    done,
  }
}

const DEADLINE_MS = 10_000
const POLL_MS = 20

/** Backends of this database durably waiting on a heavyweight lock, confirmed by both wait_event_type and a pg_locks row. */
async function lockWaiterPids(monitor: Sql): Promise<number[]> {
  const rows = await monitor`
    SELECT a.pid FROM pg_stat_activity a
    WHERE a.datname = current_database() AND a.wait_event_type = 'Lock'
      AND EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.granted = false)`
  return rows.map((r) => r.pid as number)
}

/**
 * True once `pid` is durably registered as blocked, specifically on a
 * heavyweight lock, by `blockerPid` — all three views must agree:
 * 1. pg_stat_activity.wait_event_type = 'Lock' for `pid`
 * 2. `blockerPid` is present in pg_blocking_pids(pid)
 * 3. pg_locks has a granted = false row for `pid`
 */
async function isBlockedOnLockBy(monitor: Sql, pid: number, blockerPid: number): Promise<boolean> {
  const [row] = await monitor`
    SELECT
      a.wait_event_type = 'Lock' AS waiting_on_lock,
      ${blockerPid} = ANY (pg_blocking_pids(a.pid)) AS blocked_by_target,
      EXISTS (SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.granted = false) AS has_ungranted_lock
    FROM pg_stat_activity a
    WHERE a.pid = ${pid} AND a.datname = current_database()`
  if (!row) return false
  return Boolean(row.waiting_on_lock) && Boolean(row.blocked_by_target) && Boolean(row.has_ungranted_lock)
}

async function diagnostics(monitor: Sql): Promise<string> {
  try {
    const activity = await monitor`
      SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by
      FROM pg_stat_activity WHERE datname = current_database() ORDER BY pid`
    const locks = await monitor`
      SELECT pid, locktype, mode, granted, relation::regclass::text AS relation
      FROM pg_locks
      WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY pid`
    return `pg_stat_activity:\n${JSON.stringify(activity, null, 2)}\npg_locks:\n${JSON.stringify(locks, null, 2)}`
  } catch (e) {
    return `(failed to collect diagnostics: ${String(e)})`
  }
}

/**
 * Resolve once `n` backends are durably blocked (directly, on a heavyweight
 * lock) by `blockerPid`. Bounded by a 10s deadline; on timeout, throws with a
 * pg_stat_activity / pg_locks dump instead of letting the caller proceed on
 * an unproven precondition.
 */
export async function waitBlockedBy(monitor: Sql, blockerPid: number, n = 1): Promise<number[]> {
  const deadline = Date.now() + DEADLINE_MS
  while (Date.now() < deadline) {
    const rows = await monitor`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND ${blockerPid} = ANY(pg_blocking_pids(pid))`
    const candidates = rows.map((r) => r.pid as number)
    const confirmed: number[] = []
    for (const pid of candidates) {
      if (await isBlockedOnLockBy(monitor, pid, blockerPid)) confirmed.push(pid)
    }
    if (confirmed.length >= n) return confirmed
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(
    `timed out waiting for ${n} backend(s) durably blocked by ${blockerPid}\n${await diagnostics(monitor)}`,
  )
}

/** Wait until `n` backends of this database are durably waiting on a heavyweight lock. */
export async function waitLockWaiters(monitor: Sql, n: number): Promise<void> {
  const deadline = Date.now() + DEADLINE_MS
  while (Date.now() < deadline) {
    if ((await lockWaiterPids(monitor)).length >= n) return
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(`timed out waiting for ${n} lock waiter(s)\n${await diagnostics(monitor)}`)
}

/**
 * Resolve once `n` backends of this database durably wait on a heavyweight
 * lock, or once `settled` resolves (the action under test did not wait at
 * all). Returns which of the two happened.
 */
export async function waitLockWaitersOr(
  monitor: Sql,
  n: number,
  settled: Promise<unknown>,
): Promise<'waiting' | 'settled'> {
  let isSettled = false
  settled.then(() => { isSettled = true }, () => { isSettled = true })
  const deadline = Date.now() + DEADLINE_MS
  while (Date.now() < deadline) {
    if (isSettled) return 'settled'
    if ((await lockWaiterPids(monitor)).length >= n) return 'waiting'
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  if (isSettled) return 'settled'
  throw new Error(`timed out waiting for ${n} lock waiter(s)\n${await diagnostics(monitor)}`)
}

export function sqlstate(e: unknown): string | undefined {
  let cur: unknown = e
  for (let d = 0; cur && d < 4; d++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    cur = (cur as { cause?: unknown }).cause
  }
  return undefined
}

export function describeSettled(r: PromiseSettledResult<unknown>): unknown {
  return r.status === 'fulfilled' ? r.value : { rejected: sqlstate(r.reason) ?? String(r.reason) }
}
