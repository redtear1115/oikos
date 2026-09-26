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
//
// ─── #1444 fix: why a tolerance doesn't work, and what does ───────────────
//
// The obvious-looking fix is a tolerance: accept `created_at < boundary +
// slop` instead of a strict `<`. Measured against a scratch copy of
// `lib/db/queries/epoch.ts` with `clock_timestamp()` swapped for `now()`
// (the exact regression #1290 guards against — the boundary frozen at the
// closer's transaction start instead of read fresh after its locks), the
// gap this produces is only ~20–60ms: `writerRowBefore`'s comparison goes
// from ~(-30 to -4)ms (correct: the writer's row a few ms before the
// boundary) to ~(+21 to +59)ms (buggy: the boundary now predates the row).
// That is *smaller* than the ~0.4–0.6s clock-step magnitude this repo
// measured (see header, and reproduced in #1444's PR with a tight
// `clock_timestamp()`-polling loop). A tolerance wide enough to absorb the
// step would also swallow the regression; a tolerance narrow enough to
// still catch the regression does nothing for the step. There is no
// threshold that separates the two, so this specific comparison cannot be
// made step-tolerant by widening it — any width is either too wide (masks
// the bug) or too narrow (still flaky).
//
// A sequence- or txid-based witness (taken by the writer before its commit,
// compared against one taken after the closer's boundary read) was also
// considered and rejected: it can prove *statement order* — that the
// closer's boundary-reading statement executed after the writer's commit —
// but the #1290 regression this test guards against is not an
// ordering bug, it's a *value* bug. `now()` vs `clock_timestamp()` changes
// which value a statement returns, not when the statement runs; the closer
// calls whichever function at the exact same program point either way,
// after the same locks, so any purely order-based witness reads identically
// in the correct and the buggy case. Distinguishing them requires comparing
// the actual wall-clock value written — which is exactly the comparison the
// clock step corrupts. (`pg_xact_commit_timestamp`, the other order-ish
// option, is also a wall-clock read under the hood and needs
// `track_commit_timestamp` on besides — no better.)
//
// What actually works: detect the step instead of tolerating its size. The
// vitest process runs natively on the host (macOS), not inside the Docker
// Desktop Linux VM that runs Postgres — only Postgres's clock steps; the
// test process's own `Date.now()` does not. So the offset between
// Postgres's `clock_timestamp()` and this process's `Date.now()`, sampled
// right before and right after the interleaving under test, is a
// step-detector: if that offset moved by more than ordinary round-trip
// jitter between the two samples, the VM's clock stepped *during* the
// window whose reads we're about to compare, and the run is unsafe to
// judge — not "the lock order was wrong", "we can't tell". `retryOnClockStep`
// wraps a whole test body (fixtures included, since these actions are
// one-shot: a group that already left or already closed can't be
// re-interleaved) and reruns it with fresh fixtures when a step is
// detected, up to a small bound. It does not touch the assertions
// themselves, which stay exactly as strict as before (`toBe(true)`, no
// slop) — it only refuses to let a step-corrupted window reach them.

import type postgres from 'postgres'
type Sql = ReturnType<typeof postgres>

/**
 * Offset (ms) between Postgres's wall clock and this process's, sampled as
 * closely together as a round trip allows. Not itself meaningful (network
 * latency and scheduling jitter both land in it) — only the *change* in this
 * value between two samples is (see #1444 fix section above).
 */
async function pgNodeClockOffsetMs(monitor: Sql): Promise<number> {
  const t0 = Date.now()
  const [{ pgNow }] = await monitor<{ pgNow: Date }[]>`SELECT clock_timestamp() AS "pgNow"`
  const t1 = Date.now()
  return pgNow.getTime() - (t0 + t1) / 2
}

/**
 * Generous margin over ordinary round-trip jitter (typically well under
 * 10ms against a local Docker Postgres) but well under the ~0.4–0.6s step
 * this repo has measured — any real step clears this by 3x or more.
 */
const CLOCK_STEP_JITTER_MS = 150

const MAX_CLOCK_STEP_ATTEMPTS = 5

/**
 * Run `body` (which should set up its own fixtures and make its own strict
 * wall-clock assertions — nothing about this weakens them) and, if it
 * throws, check whether the Docker Desktop VM's clock stepped during the
 * attempt (see #1444 fix section above). If it did, the failure is
 * discarded and `body` runs again with whatever fresh fixtures it creates;
 * if it didn't, the failure is real and is rethrown immediately. Retries
 * are bounded — if every attempt's window overlaps a step (not observed in
 * practice: steps are ~0.4–0.6s roughly every 10s, and one attempt here
 * runs in low hundreds of ms at most), the last error is rethrown.
 */
export async function retryOnClockStep(monitor: Sql, body: () => Promise<void>): Promise<void> {
  for (let attempt = 1; attempt <= MAX_CLOCK_STEP_ATTEMPTS; attempt++) {
    const before = await pgNodeClockOffsetMs(monitor)
    try {
      await body()
      return
    } catch (err) {
      const after = await pgNodeClockOffsetMs(monitor)
      const stepped = Math.abs(after - before) > CLOCK_STEP_JITTER_MS
      if (!stepped || attempt === MAX_CLOCK_STEP_ATTEMPTS) throw err
      // else: the clock stepped inside this attempt's window — discard it
      // and let the loop try again with fresh fixtures.
    }
  }
}

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
