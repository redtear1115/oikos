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
// Postgres's `clock_timestamp()` and this process's `Date.now()` is a
// step-detector: if that offset moves by more than ordinary round-trip
// jitter, the VM's clock stepped, and the run is unsafe to judge — not "the
// lock order was wrong", "we can't tell". `retryOnClockStep` wraps a whole
// test body (fixtures included, since these actions are one-shot: a group
// that already left or already closed can't be re-interleaved) and reruns
// it with fresh fixtures when a step is detected, up to a small bound. It
// does not touch the assertions themselves, which stay exactly as strict as
// before (`toBe(true)`, no slop) — it only refuses to let a step-corrupted
// window reach them.
//
// ─── round 2: a before/after bracket misses a step that fits inside one
// attempt ───────────────────────────────────────────────────────────────
//
// The first version of this sampled the offset once right before `body()`
// and once right after it threw. That misses the actual shape of the
// Docker Desktop step: it isn't an instantaneous jump, it's a *dip* —
// Postgres's clock drops ~505–580ms, then climbs back 160–220ms later, all
// within the same ~10s cycle. An attempt whose window is longer than the
// dip (which most are: a single attempt here runs low hundreds of ms, but
// the dip is under a second) can start *and end* on the "normal" side of
// it, so both bracket samples read a normal offset even though a
// comparison taken *during* the dip was corrupted. This produced a
// residual failure that wasn't retried (1 in 110 unmodified runs).
//
// The fix is a sampler that runs *throughout* the attempt, not just at its
// edges: `ClockOffsetSampler` opens its own connection (so its polling
// never contends with the interleaving's own connections) and reads
// `clock_timestamp()` vs `Date.now()` every ~20ms for the attempt's whole
// duration, keeping the widest deviation from the attempt's first sample.
// That first sample is a fresh per-attempt baseline (not a fixed constant),
// so ordinary cross-attempt offset drift — different round-trip latency,
// different point in the host's own clock discipline — never itself counts
// as a step; only a swing *within* one attempt's samples does. Measured
// thresholds: normal p99 gap between consecutive samples is ~1.5ms, the
// worst normal (non-step) attempt seen swung 136ms, and real steps swing
// ~575ms — the existing 150ms threshold sits cleanly between those and
// applies to the sampler's within-attempt max exactly as it did to the old
// bracket's before/after delta.
//
// The sampler's connection sets `application_name` so the harness's DB-wide
// waiter-counting queries (`lockWaiterPids`, `waitBlockedBy`) can exclude
// it — it never takes or waits on a lock, but excluding it by name is
// cheaper than reasoning about why an idle polling connection can't
// possibly show up as one.
//
// ─── round 1 fix, visibility ────────────────────────────────────────────
//
// A retry that discards a real (if step-corrupted) failure silently is a
// second way for this file to hide something from whoever reads a green
// run: every retry now logs which test, which attempt, and the offset
// swing that triggered it, and each file's `afterAll` should print the
// running attempt/retry counts (see `getClockStepRetryStats` and the
// `afterAll` blocks in the three test files) so a change in the retry rate
// shows up in CI output even when every run still passes.

import postgres from 'postgres'
import { expect } from 'vitest'
type Sql = ReturnType<typeof postgres>

/**
 * `application_name` the offset sampler connects with, so the harness's
 * DB-wide waiter-counting queries can exclude it by name (see round-2 note
 * above) instead of relying on it just happening never to wait on a lock.
 */
const CLOCK_SAMPLER_APPLICATION_NAME = 'oikos_test_1444_clock_sampler'

/**
 * Generous margin over ordinary round-trip/scheduling jitter (measured p99
 * ~1.5ms between samples, worst normal attempt 136ms) but well under the
 * ~505–580ms dip magnitude this repo has measured — any real step clears
 * this by 3x or more either way.
 */
const CLOCK_STEP_JITTER_MS = 150

const SAMPLE_INTERVAL_MS = 20
const MAX_CLOCK_STEP_ATTEMPTS = 5

/**
 * Polls `clock_timestamp()` vs this process's `Date.now()` on its own
 * connection every `SAMPLE_INTERVAL_MS` for as long as it's running, and
 * tracks the widest deviation from its first sample (the attempt's
 * baseline) — a within-attempt dip, not just a before/after bracket (see
 * round-2 note above). One instance is scoped to one `retryOnClockStep`
 * attempt: construct, `start()`, run `body()`, `stop()` in `finally`.
 */
class ClockOffsetSampler {
  private readonly sql: Sql
  private timer: ReturnType<typeof setInterval> | null = null
  private baseline: number | null = null
  private maxDelta = 0
  private polling = false

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      connection: { application_name: CLOCK_SAMPLER_APPLICATION_NAME },
    })
  }

  private async sampleOffset(): Promise<number> {
    const t0 = Date.now()
    const [{ pgNow }] = await this.sql<{ pgNow: Date }[]>`SELECT clock_timestamp() AS "pgNow"`
    const t1 = Date.now()
    return pgNow.getTime() - (t0 + t1) / 2
  }

  private recordSample(offset: number) {
    if (this.baseline === null) {
      this.baseline = offset
      return
    }
    this.maxDelta = Math.max(this.maxDelta, Math.abs(offset - this.baseline))
  }

  async start(): Promise<void> {
    this.recordSample(await this.sampleOffset())
    this.polling = true
    const pollOnce = () => {
      if (!this.polling) return
      this.sampleOffset()
        .then((offset) => this.recordSample(offset))
        .catch(() => {}) // a dropped sample just narrows the window we can see into, never widens it
        .finally(() => {
          if (this.polling) this.timer = setTimeout(pollOnce, SAMPLE_INTERVAL_MS)
        })
    }
    this.timer = setTimeout(pollOnce, SAMPLE_INTERVAL_MS)
  }

  /** Widest offset swing seen from this attempt's own baseline, so far. */
  getMaxDelta(): number {
    return this.maxDelta
  }

  async stop(): Promise<void> {
    this.polling = false
    if (this.timer) clearTimeout(this.timer)
    await this.sql.end({ timeout: 1 }).catch(() => {})
  }
}

let attemptCount = 0
let retryCount = 0

/** Per-file (module-scoped) counters for the `afterAll` summary line — see round-1 visibility note above. */
export function getClockStepRetryStats(): { attempts: number; retries: number } {
  return { attempts: attemptCount, retries: retryCount }
}

async function runAttempt(
  databaseUrl: string,
  body: () => Promise<void>,
): Promise<{ ok: true } | { ok: false; error: unknown; maxDelta: number }> {
  const sampler = new ClockOffsetSampler(databaseUrl)
  try {
    await sampler.start()
    try {
      await body()
      return { ok: true }
    } catch (error) {
      return { ok: false, error, maxDelta: sampler.getMaxDelta() }
    }
  } finally {
    await sampler.stop()
  }
}

/**
 * Run `body` (which should set up its own fixtures and make its own strict
 * wall-clock assertions — nothing about this weakens them) and, if it
 * throws, check whether the Docker Desktop VM's clock stepped at any point
 * during the attempt (see #1444 fix section above — a continuous sampler,
 * not just a before/after bracket). If it did, the failure is discarded —
 * logged, not silent — and `body` runs again with whatever fresh fixtures
 * it creates; if it didn't, the failure is real and is rethrown
 * immediately. Retries are bounded — if every attempt's window overlaps a
 * step (not observed in practice: steps are ~0.4–0.6s roughly every 10s,
 * and one attempt here runs in low hundreds of ms at most), the last error
 * is rethrown.
 */
export async function retryOnClockStep(databaseUrl: string, body: () => Promise<void>): Promise<void> {
  const testName = expect.getState().currentTestName ?? '(unknown test)'
  for (let attempt = 1; attempt <= MAX_CLOCK_STEP_ATTEMPTS; attempt++) {
    attemptCount++
    const result = await runAttempt(databaseUrl, body)
    if (result.ok) return
    const stepped = result.maxDelta > CLOCK_STEP_JITTER_MS
    if (!stepped || attempt === MAX_CLOCK_STEP_ATTEMPTS) throw result.error
    retryCount++
    const message = result.error instanceof Error ? result.error.message : String(result.error)
    console.warn(
      `[retryOnClockStep] "${testName}": attempt ${attempt}/${MAX_CLOCK_STEP_ATTEMPTS} discarded — ` +
        `clock offset swung ${result.maxDelta.toFixed(1)}ms during the window (> ${CLOCK_STEP_JITTER_MS}ms ` +
        `threshold), consistent with a Docker Desktop VM clock dip (see _lockHarness.ts header). ` +
        `Retrying with fresh fixtures. Underlying failure: ${message}`,
    )
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

/**
 * Backends of this database durably waiting on a heavyweight lock, confirmed
 * by both wait_event_type and a pg_locks row. Excludes the clock-offset
 * sampler's own connection by `application_name` — it never takes or waits
 * on a lock, but this is a DB-wide scan (no specific pid to reason about),
 * so excluding it by name is cheaper than trusting that.
 */
async function lockWaiterPids(monitor: Sql): Promise<number[]> {
  const rows = await monitor`
    SELECT a.pid FROM pg_stat_activity a
    WHERE a.datname = current_database() AND a.wait_event_type = 'Lock'
      AND a.application_name <> ${CLOCK_SAMPLER_APPLICATION_NAME}
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
      WHERE datname = current_database() AND application_name <> ${CLOCK_SAMPLER_APPLICATION_NAME}
        AND ${blockerPid} = ANY(pg_blocking_pids(pid))`
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
