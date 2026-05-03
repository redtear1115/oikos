# Phase 1e — Real-time + pg_cron + Server Action Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase 1 by adding the three remaining acceptance items (#7, #10, #11) plus a small UX consistency fix:

1. **Real-time** — Supabase `postgres_changes` subscription on `CashTransactions` / `Settlements` / `GroupBalance`. Partner INSERT prepends a row with a 1s 淡黃 highlight; UPDATE/DELETE removes; balance card cross-fades on every GroupBalance change. Reconnection refetches page 1.
2. **pg_cron cleanup** — Weekly Sunday 03:00 job that DELETEs `deleted_at < NOW() - INTERVAL '1 year'` rows from `CashTransactions` + `Settlements`.
3. **Server action tests** — Extract input validation into pure `lib/validators.ts` (testable, reusable), then add lightweight integration tests for the 12 write actions using a mock supabase + db harness.
4. **Dashboard filter parity** — Add the same 「篩選 ›」 entry next to dashboard's 「最近紀錄」 header. Reverses the 1d decision (filter was 「只放 /records」). Reason: dashboard's recent list will eventually be replaced with charts, and the filter should apply identically across both surfaces — adding the button now keeps the parity guarantee in place from day one.

**Architecture:**

- *Real-time:* one channel per group, subscribed in a new `RealtimeProvider` client component that wraps `DashboardLayout`'s children. The provider exposes a tiny event bus via React context — pages subscribe via `useRealtimeEvents()` and decide what to do (TransactionFeed prepends/removes; BalanceHero updates). Filter-aware: `TransactionFeed` checks incoming events against its current `filter` prop and silently drops non-matches (per design call: don't disrupt the filtered view).
- *pg_cron:* a single Drizzle SQL migration that calls `cron.schedule(...)`. Idempotent via `cron.unschedule` first. User runs `npm run db:migrate` to apply.
- *Tests:* validation logic is pulled out of every server action into `lib/validators.ts` (pure, testable). Then a minimal `tests/_mocks/` harness mocks `@/lib/supabase/server` + `@/lib/db/client` + `next/cache`. Tests cover: happy path, validation errors, auth required, group not found, atomic-transaction sanity.

**Tech Stack:** Next.js 16 App Router · React 19 · Drizzle ORM · Supabase Realtime (`@supabase/ssr` already on client) · vitest + jsdom (existing).

**Visual reference:** [docs/superpowers/specs/2026-05-02-phase-1-transactions-design.md](../specs/2026-05-02-phase-1-transactions-design.md) §7 (Real-time), §9.5 (pg_cron).

**Builds on Phase 1d:** Reuses `lib/filter.ts` (adds `matchesFilter`), `app/(dashboard)/layout.tsx` (wraps children in `RealtimeProvider`), `TransactionFeed.tsx` (gains realtime event handling), `BalanceHero.tsx` (gains balance cross-fade).

**Out of scope:**
- Push notifications (no PWA push in Phase 1)
- Toast / sound on real-time events (spec is explicit: subtle highlight only)
- Connection-lost UI indicator (spec: don't show, avoid anxiety)
- Dashboard-on-dashboard echo suppression (the same user editing on the same tab triggers the realtime callback too — handled by deduping on the row id, simpler than ignoring own events)
- Asset / Phase-2 actions (no tests needed yet)

---

## File structure overview

**New:**
- `lib/realtime/event.ts` — discriminated-union event types + helpers
- `lib/validators.ts` — pure input validators (extracted from server actions)
- `tests/validators.test.ts` — unit tests for validators
- `tests/_mocks/supabase.ts` — mock supabase server client + auth
- `tests/_mocks/db.ts` — mock Drizzle db client (chainable spies, fake transaction wrapper)
- `tests/actions-transaction.test.ts` — integration tests for actions/transaction.ts
- `tests/actions-settlement.test.ts` — integration tests for actions/settlement.ts
- `tests/actions-group.test.ts` — integration tests for actions/group.ts + actions/profile.ts
- `app/(dashboard)/_components/RealtimeProvider.tsx` — channel subscription + event bus
- `drizzle/0001_pg_cron_cleanup.sql` — pg_cron schedule SQL

**Modified:**
- `lib/filter.ts` — adds `matchesFilter(row, filter)` helper
- `tests/filter.test.ts` — adds tests for `matchesFilter`
- `app/(dashboard)/layout.tsx` — wraps children in `<RealtimeProvider groupId={group.id}>`
- `app/(dashboard)/_components/TransactionFeed.tsx` — subscribes to realtime, prepends/removes rows with highlight + filter-awareness
- `app/(dashboard)/dashboard/_components/BalanceHero.tsx` — subscribes to realtime, cross-fades balance number
- `app/globals.css` — adds `--realtime-flash` color token + `.rt-flash` keyframe class
- `actions/transaction.ts` — uses `validateTransactionInput` + `validateName`
- `actions/settlement.ts` — uses `validateSettlementInput`
- `actions/group.ts` — uses `validateName`
- `actions/profile.ts` — uses `validateName`

---

## Task 1: Filter matcher + realtime event types + tests

Two pure-function additions, both in support of the realtime work:

- `matchesFilter(row, filter)` in `lib/filter.ts` — given a feed row and a filter, returns whether the row passes. Used by `TransactionFeed` to decide whether to display incoming realtime events.
- `lib/realtime/event.ts` — discriminated union for the event-bus payload (TxnInsert / TxnUpdate / TxnDelete / SettleInsert / SettleUpdate / SettleDelete / BalanceChange).

**Files:**

- Modify: `lib/filter.ts`
- Modify: `tests/filter.test.ts`
- Create: `lib/realtime/event.ts`

- [ ] **Step 1: Add `matchesFilter` to `lib/filter.ts`**

Append to the existing file (after `fromWire`):

```ts
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

/** Minimal row shape for filter matching — fields any feed row will have. */
export interface FilterableRow {
  paidBy: string
  splitType: SplitType | null   // null for settlements
  category: string              // 'settle' for settlements
  kind: 'transaction' | 'settlement'
}

/**
 * Returns whether a row passes the given filter.
 *
 * @param row - The row to test
 * @param filter - The active filter
 * @param viewerId - The signed-in user's id (used to resolve 'mine'/'theirs')
 * @param partnerId - The partner's user id (or null if no partner yet)
 */
export function matchesFilter(
  row: FilterableRow,
  filter: TxnFilter,
  viewerId: string,
  partnerId: string | null,
): boolean {
  // 誰付 dimension applies to both transactions and settlements
  if (filter.payer === 'mine' && row.paidBy !== viewerId) return false
  if (filter.payer === 'theirs') {
    if (!partnerId || row.paidBy !== partnerId) return false
  }

  // Settlements pass through if no transaction-only dim is active.
  // If split or categories filter is active, settlements are dropped entirely
  // (they have no split_type / category).
  if (row.kind === 'settlement') {
    return !hidesSettlements(filter)
  }

  // 分攤 dimension — transactions only
  if (filter.split !== 'all' && row.splitType !== filter.split) return false

  // 分類 dimension — transactions only
  if (filter.categories.size > 0 && !filter.categories.has(row.category as CategoryId)) {
    return false
  }

  return true
}
```

- [ ] **Step 2: Add tests to `tests/filter.test.ts`**

Append after the existing tests:

```ts
import { matchesFilter, type FilterableRow } from '@/lib/filter'

const txMine: FilterableRow = { paidBy: 'me', splitType: 'half', category: 'food', kind: 'transaction' }
const txTheirs: FilterableRow = { paidBy: 'them', splitType: 'all_theirs', category: 'transit', kind: 'transaction' }
const settleMine: FilterableRow = { paidBy: 'me', splitType: null, category: 'settle', kind: 'settlement' }
const settleTheirs: FilterableRow = { paidBy: 'them', splitType: null, category: 'settle', kind: 'settlement' }

describe('matchesFilter — payer dimension', () => {
  it('all → all rows pass', () => {
    const f = defaultFilter()
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
  })
  it('mine → only my rows', () => {
    const f = { ...defaultFilter(), payer: 'mine' as const }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleTheirs, f, 'me', 'them')).toBe(false)
  })
  it('theirs with no partner → nothing passes', () => {
    const f = { ...defaultFilter(), payer: 'theirs' as const }
    expect(matchesFilter(txTheirs, f, 'me', null)).toBe(false)
  })
  it('theirs with partner → only partner rows', () => {
    const f = { ...defaultFilter(), payer: 'theirs' as const }
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(false)
  })
})

describe('matchesFilter — split dimension', () => {
  it('all → tx + settle pass', () => {
    const f = defaultFilter()
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(true)
  })
  it('half → only half tx; settle dropped', () => {
    const f = { ...defaultFilter(), split: 'half' as const }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)        // half
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)     // all_theirs
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)   // settlements dropped
  })
})

describe('matchesFilter — category dimension', () => {
  it('food selected → only food tx; settle dropped', () => {
    const f = { ...defaultFilter(), categories: new Set(['food'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(false)
    expect(matchesFilter(settleMine, f, 'me', 'them')).toBe(false)
  })
  it('multi-category union', () => {
    const f = { ...defaultFilter(), categories: new Set(['food', 'transit'] as const) }
    expect(matchesFilter(txMine, f, 'me', 'them')).toBe(true)
    expect(matchesFilter(txTheirs, f, 'me', 'them')).toBe(true)
  })
})
```

- [ ] **Step 3: Create `lib/realtime/event.ts`**

```ts
/**
 * Discriminated union for realtime events flowing from the RealtimeProvider's
 * channel subscriptions to the page-level subscribers (TransactionFeed, BalanceHero).
 *
 * Each event includes the new row (for INSERT/UPDATE) or just the id (for DELETE).
 * Settlements use the same shape as transactions where applicable.
 */

import type { SplitType } from '@/lib/balance'

export interface TxnRowPayload {
  id: string
  groupId: string
  paidBy: string
  amount: number
  splitType: SplitType
  description: string
  category: string
  transactedAt: string  // ISO
  createdAt: string     // ISO
  deletedAt: string | null  // ISO when soft-deleted
}

export interface SettleRowPayload {
  id: string
  groupId: string
  paidBy: string
  amount: number
  note: string | null
  settledAt: string     // ISO
  createdAt: string     // ISO
  deletedAt: string | null
}

export type RealtimeEvent =
  | { kind: 'txn-insert'; row: TxnRowPayload }
  | { kind: 'txn-update'; row: TxnRowPayload }   // soft-delete shows up here too (deletedAt becomes set)
  | { kind: 'settle-insert'; row: SettleRowPayload }
  | { kind: 'settle-update'; row: SettleRowPayload }
  | { kind: 'balance-change'; balance: number; version: number }
  | { kind: 'reconnect' }   // emitted after WebSocket reconnect — subscribers should refetch
```

- [ ] **Step 4: Verify**

Run: `npx vitest run` — expect 67 passing (54 prior + 13 new for matchesFilter; pure type file adds none).
Run: `npx tsc --noEmit` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/filter.ts lib/realtime/event.ts tests/filter.test.ts
git commit -m "feat(realtime): matchesFilter helper + RealtimeEvent types"
```

---

## Task 2: `RealtimeProvider` + DashboardLayout wiring

The provider opens one Supabase channel for the user's group and exposes a tiny event bus via React context. Subscribers register a handler with `useRealtimeEvents(handler)`. On reconnect, an artificial `{ kind: 'reconnect' }` event is dispatched so subscribers can refetch.

**Files:**

- Create: `lib/supabase/client.ts` (browser-side Supabase client — needed for realtime; SSR client can't subscribe)
- Create: `app/(dashboard)/_components/RealtimeProvider.tsx`
- Modify: `app/(dashboard)/layout.tsx` (wrap children)

- [ ] **Step 1: Create `lib/supabase/client.ts`**

```ts
'use client'

import { createBrowserClient } from '@supabase/ssr'

let cached: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (cached) return cached
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return cached
}
```

- [ ] **Step 2: Create `app/(dashboard)/_components/RealtimeProvider.tsx`**

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeEvent, TxnRowPayload, SettleRowPayload } from '@/lib/realtime/event'

type Handler = (event: RealtimeEvent) => void

interface BusContextValue {
  subscribe: (handler: Handler) => () => void  // returns unsubscribe fn
}

const BusContext = createContext<BusContextValue | null>(null)

/** Subscribe a handler. Returns an unsubscribe; call from useEffect cleanup. */
export function useRealtimeEvents(handler: Handler) {
  const ctx = useContext(BusContext)
  // Stash handler in a ref so we don't re-subscribe on every render.
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!ctx) return
    return ctx.subscribe((e) => handlerRef.current(e))
  }, [ctx])
}

interface Props {
  groupId: string
  children: React.ReactNode
}

export function RealtimeProvider({ groupId, children }: Props) {
  const handlersRef = useRef<Set<Handler>>(new Set())

  const subscribe = useCallback<BusContextValue['subscribe']>((handler) => {
    handlersRef.current.add(handler)
    return () => { handlersRef.current.delete(handler) }
  }, [])

  const dispatch = useCallback((event: RealtimeEvent) => {
    handlersRef.current.forEach((h) => h(event))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`group:${groupId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'CashTransactions', filter: `group_id=eq.${groupId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ kind: 'txn-insert', row: rowFromPayload(payload.new) as TxnRowPayload })
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ kind: 'txn-update', row: rowFromPayload(payload.new) as TxnRowPayload })
          }
          // DELETE: we soft-delete, so DELETE events shouldn't fire. Hard delete via pg_cron fires DELETE
          // but those rows are >1yr stale and likely already off-screen. Ignore.
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'Settlements', filter: `group_id=eq.${groupId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            dispatch({ kind: 'settle-insert', row: rowFromPayload(payload.new) as SettleRowPayload })
          } else if (payload.eventType === 'UPDATE') {
            dispatch({ kind: 'settle-update', row: rowFromPayload(payload.new) as SettleRowPayload })
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'GroupBalance', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const b = payload.new as { balance: number; version: number }
          dispatch({ kind: 'balance-change', balance: b.balance, version: b.version })
        })

    let wasSubscribed = false
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (wasSubscribed) {
          // This is a re-subscribe after a disconnect — tell subscribers to refetch.
          dispatch({ kind: 'reconnect' })
        }
        wasSubscribed = true
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, dispatch])

  return <BusContext.Provider value={{ subscribe }}>{children}</BusContext.Provider>
}

/**
 * Postgres realtime payloads use snake_case column names. Convert to camelCase to
 * match the rest of the app. Timestamps come in as ISO strings already.
 */
function rowFromPayload(raw: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[camel] = v
  }
  return out
}
```

- [ ] **Step 3: Wire into `app/(dashboard)/layout.tsx`**

Find the existing `<ViewerProvider value={value}>` wrapper. Replace with:

```tsx
import { RealtimeProvider } from './_components/RealtimeProvider'

// ... inside the return
return (
  <ViewerProvider value={value}>
    <RealtimeProvider groupId={group.id}>
      <div className="relative max-w-md mx-auto min-h-screen" style={{ background: 'var(--bg)' }}>
        {children}
      </div>
    </RealtimeProvider>
  </ViewerProvider>
)
```

- [ ] **Step 4: Verify**

Run: `npm run build` — expect pass.
Run: `npx vitest run` — expect 67 passing.
Run: `npx tsc --noEmit` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/client.ts 'app/(dashboard)/_components/RealtimeProvider.tsx' 'app/(dashboard)/layout.tsx'
git commit -m "feat(realtime): RealtimeProvider with channel + event bus, wired into layout"
```

---

## Task 3: `TransactionFeed` consumes realtime events

INSERT → prepend with `.rt-flash` class (1s yellow→fade). UPDATE → if `deletedAt` set, fade out 0.5s then remove; if not deleted (shouldn't happen for our tx editing flow but defensive), update in place. Settlement events analogous. Filter-aware via `matchesFilter`.

**Files:**

- Modify: `app/globals.css` (add flash keyframe + tokens)
- Modify: `app/(dashboard)/_components/TransactionFeed.tsx`

- [ ] **Step 1: Add flash CSS to `app/globals.css`**

Append:

```css
:root {
  --realtime-flash: #fffbe8;
}

@keyframes rt-flash {
  0%   { background: var(--realtime-flash); }
  100% { background: transparent; }
}
.rt-flash {
  animation: rt-flash 1s ease-out;
}

@keyframes rt-fade-out {
  0%   { opacity: 1; max-height: 80px; }
  100% { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
}
.rt-fading {
  animation: rt-fade-out 0.5s ease-out forwards;
  overflow: hidden;
}
```

- [ ] **Step 2: Update `TransactionFeed.tsx`**

Add imports:

```ts
import { useRealtimeEvents } from './RealtimeProvider'
import { matchesFilter, type FilterableRow } from '@/lib/filter'
import { useMember } from './MemberContext'
```

Inside the function body, after the existing useEffects, add a realtime handler:

```tsx
  const { viewer, partner } = useMember()

  useRealtimeEvents((event) => {
    if (event.kind === 'reconnect') {
      // Refetch page 1 (with current filter, if any) to re-align.
      startLoading(async () => {
        try {
          const fresh = await loadMoreTransactions(null, pageSize, filter ? toWire(filter) : undefined)
          setItems(fresh)
          setHasMore(fresh.length === pageSize)
        } catch {
          // Silent — reconnect refetch is best-effort.
        }
      })
      return
    }

    if (event.kind === 'txn-insert') {
      const row = event.row
      // Build a feed-row from the realtime payload + filter-check.
      const feed = {
        id: row.id,
        amount: row.amount,
        splitType: row.splitType,
        description: row.description,
        category: row.category,
        paidBy: row.paidBy,
        transactedAt: row.transactedAt,
        createdAt: row.createdAt,
        kind: 'transaction' as const,
      }
      if (filter) {
        const f: FilterableRow = { paidBy: row.paidBy, splitType: row.splitType, category: row.category, kind: 'transaction' }
        if (!matchesFilter(f, filter, viewer.id, partner?.id ?? null)) return
      }
      setItems((cur) => {
        if (cur.some((r) => r.id === row.id)) return cur  // dedupe (own-write echo)
        return [feed, ...cur]
      })
      // Highlight after the row is in DOM.
      requestAnimationFrame(() => {
        document.querySelector(`[data-rt-id="${row.id}"]`)?.classList.add('rt-flash')
      })
    } else if (event.kind === 'txn-update') {
      const row = event.row
      if (row.deletedAt) {
        // Soft-delete fade-out
        const el = document.querySelector(`[data-rt-id="${row.id}"]`)
        el?.classList.add('rt-fading')
        setTimeout(() => {
          setItems((cur) => cur.filter((r) => r.id !== row.id))
        }, 500)
      }
      // Non-delete UPDATE shouldn't happen in our flow (edits = soft-delete + insert),
      // but if it does, leave items as-is to avoid jitter.
    } else if (event.kind === 'settle-insert' || event.kind === 'settle-update') {
      // Same pattern — settle row shape is different, treat as 'settlement' kind.
      const row = event.row
      if (event.kind === 'settle-update' && row.deletedAt) {
        const el = document.querySelector(`[data-rt-id="${row.id}"]`)
        el?.classList.add('rt-fading')
        setTimeout(() => {
          setItems((cur) => cur.filter((r) => r.id !== row.id))
        }, 500)
        return
      }
      if (event.kind === 'settle-insert') {
        const feed = {
          id: row.id,
          amount: row.amount,
          splitType: null,
          description: row.note ?? '還款',
          category: 'settle',
          paidBy: row.paidBy,
          transactedAt: row.settledAt,
          createdAt: row.createdAt,
          kind: 'settlement' as const,
        }
        if (filter) {
          const f: FilterableRow = { paidBy: row.paidBy, splitType: null, category: 'settle', kind: 'settlement' }
          if (!matchesFilter(f, filter, viewer.id, partner?.id ?? null)) return
        }
        setItems((cur) => {
          if (cur.some((r) => r.id === row.id)) return cur
          return [feed, ...cur]
        })
        requestAnimationFrame(() => {
          document.querySelector(`[data-rt-id="${row.id}"]`)?.classList.add('rt-flash')
        })
      }
    }
  })
```

- [ ] **Step 3: Add `data-rt-id` to row markup**

Find the `<CompactRow ... />` invocation. Wrap or pass through `data-rt-id`. Easiest: wrap in a div. Find:

```tsx
              {g.items.map((tx, i) => (
                <CompactRow
                  key={tx.id}
                  tx={tx as CompactRowProps['tx']}
                  isLast={i === g.items.length - 1}
                  onClick={() => onItemClick(tx)}
                />
              ))}
```

Replace with:

```tsx
              {g.items.map((tx, i) => (
                <div key={tx.id} data-rt-id={tx.id}>
                  <CompactRow
                    tx={tx as CompactRowProps['tx']}
                    isLast={i === g.items.length - 1}
                    onClick={() => onItemClick(tx)}
                  />
                </div>
              ))}
```

- [ ] **Step 4: Verify**

Run: `npm run build` — expect pass.
Run: `npx vitest run` — expect 67 passing.

- [ ] **Step 5: Commit**

```bash
git add 'app/globals.css' 'app/(dashboard)/_components/TransactionFeed.tsx'
git commit -m "feat(realtime): TransactionFeed prepend+highlight on INSERT, fade on soft-delete"
```

---

## Task 4: `BalanceHero` cross-fade on balance change

GroupBalance UPDATE → balance number animates from old to new value with a 300ms cross-fade.

**Files:**

- Modify: `app/(dashboard)/dashboard/_components/BalanceHero.tsx`

- [ ] **Step 1: Add realtime subscription + animation**

Add imports:

```ts
import { useState, useEffect, useRef } from 'react'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
```

Inside the function, after `const balance = viewerBalance(...)` add a controlled local copy that animates:

```tsx
  const [displayedRaw, setDisplayedRaw] = useState(rawBalance)
  const [fading, setFading] = useState(false)

  // Sync if parent prop changes (e.g. after our own mutation router.refresh).
  useEffect(() => { setDisplayedRaw(rawBalance) }, [rawBalance])

  useRealtimeEvents((event) => {
    if (event.kind === 'balance-change') {
      // The realtime payload is in member_a's perspective (raw). Cross-fade.
      setFading(true)
      setTimeout(() => {
        setDisplayedRaw(event.balance)
        setFading(false)
      }, 150)
    } else if (event.kind === 'reconnect') {
      // Balance will get a fresh value via router.refresh / router refetch — no-op here.
    }
  })

  // Use displayedRaw for all derived state (instead of rawBalance).
  const balance = viewerBalance(displayedRaw, viewerIsA)
```

Then add a `style` to the balance number container (the `<div className="tnum leading-[1.05]...">`):

```tsx
            <div className="tnum leading-[1.05] tracking-[-1.4px] transition-opacity duration-150"
              style={{
                fontFamily: 'var(--font-numeric)',
                fontSize: 44,
                fontWeight: 600,
                color: 'var(--ink)',
                opacity: fading ? 0 : 1,
              }}>
```

- [ ] **Step 2: Verify**

Run: `npm run build` — expect pass.
Run: `npx vitest run` — expect 67 passing.

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/BalanceHero.tsx'
git commit -m "feat(realtime): BalanceHero cross-fades on partner mutation"
```

---

## Task 5: pg_cron cleanup migration

Schedule a weekly job that physically deletes soft-deleted rows older than 1 year. Idempotent (unschedule any existing job with the same name first).

**Files:**

- Create: `drizzle/0001_pg_cron_cleanup.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Schedule weekly cleanup of soft-deleted rows older than 1 year.
-- Runs every Sunday at 03:00 UTC.
--
-- Note: this requires the pg_cron extension. Supabase has it enabled by default
-- on Pro tier. If cron.schedule fails with "permission denied" or "extension not
-- found", enable pg_cron via the Supabase dashboard (Database → Extensions).

-- Idempotent: drop any existing schedule with the same name first.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-soft-deleted');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist; ignore.
  NULL;
END $$;

SELECT cron.schedule('cleanup-soft-deleted', '0 3 * * 0', $$
  DELETE FROM "CashTransactions" WHERE deleted_at < NOW() - INTERVAL '1 year';
  DELETE FROM "Settlements" WHERE deleted_at < NOW() - INTERVAL '1 year';
$$);
```

- [ ] **Step 2: Verify the migration is picked up**

The Drizzle migrator will discover this file based on filename order. No code changes needed.

Check that the file is sequenced AFTER any existing migrations:

```bash
ls drizzle/*.sql
```

If `0001_pg_cron_cleanup.sql` is correctly numbered (i.e., `0000_*` exists already, so `0001_*` is the next available), good. If a different sequence is in use (e.g., if `0001_*` already exists), rename to the next available index — the only constraint is that this migration runs after the table-creation migration.

- [ ] **Step 3: Commit**

```bash
git add drizzle/0001_pg_cron_cleanup.sql
git commit -m "feat(cron): weekly pg_cron cleanup of soft-deleted rows >1yr"
```

- [ ] **Step 4: Note for user**

After merging, user must run `npm run db:migrate` (or whatever the project's migration command is — check `package.json`). The migration is idempotent so re-running is safe.

---

## Task 6: Extract input validators + tests + refactor server actions

Pull validation logic out of every write action into a single pure-function module. Every validator returns the trimmed/normalized value or throws with a Traditional Chinese error.

**Files:**

- Create: `lib/validators.ts`
- Create: `tests/validators.test.ts`
- Modify: `actions/transaction.ts` (use `validateTransactionInput`)
- Modify: `actions/settlement.ts` (use `validateSettlementInput`)
- Modify: `actions/group.ts` (use `validateName`)
- Modify: `actions/profile.ts` (use `validateName`)

- [ ] **Step 1: Create `lib/validators.ts`**

```ts
import { isValidCategoryId, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

/**
 * Validates a positive integer NTD amount. Returns the value or throws.
 */
export function validateAmount(amount: number, fieldLabel = '金額'): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${fieldLabel}必須是正整數`)
  }
  return amount
}

/**
 * Validates + trims a non-empty name (帳本名稱, 顯示名稱, etc.).
 * Defaults to 1-32 char range.
 */
export function validateName(name: string, fieldLabel: string, maxLen = 32): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`${fieldLabel}不能為空`)
  if (trimmed.length > maxLen) throw new Error(`${fieldLabel}最長 ${maxLen} 字`)
  return trimmed
}

export interface TransactionInput {
  amount: number
  description: string
  category: string
  splitType: SplitType
  payerId: string
  transactedAt: Date
}

export interface ValidatedTransactionInput {
  amount: number
  description: string
  category: CategoryId
  splitType: SplitType
  payerId: string
  transactedAt: Date
}

/**
 * Validates a transaction input. Trims description, falls back unknown category to 'other',
 * rejects 'settle' (reserved for settlements). Throws on invalid amount or empty description.
 */
export function validateTransactionInput(input: TransactionInput): ValidatedTransactionInput {
  const amount = validateAmount(input.amount)
  const description = input.description.trim()
  if (!description) throw new Error('描述不能為空')
  const category: CategoryId = isValidCategoryId(input.category) ? input.category as CategoryId : 'other'
  if (category === 'settle') throw new Error('不可使用此分類')
  return {
    amount,
    description,
    category,
    splitType: input.splitType,
    payerId: input.payerId,
    transactedAt: input.transactedAt,
  }
}

export interface SettlementInput {
  amount: number
  payerId: string
  settledAt: Date
  note?: string
}

export interface ValidatedSettlementInput {
  amount: number
  payerId: string
  settledAt: Date
  note: string | null
}

/**
 * Validates a settlement input. Note is optional; empty/whitespace becomes null.
 */
export function validateSettlementInput(input: SettlementInput): ValidatedSettlementInput {
  const amount = validateAmount(input.amount)
  const note = input.note?.trim() || null
  return {
    amount,
    payerId: input.payerId,
    settledAt: input.settledAt,
    note,
  }
}
```

- [ ] **Step 2: Create `tests/validators.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  validateAmount,
  validateName,
  validateTransactionInput,
  validateSettlementInput,
} from '@/lib/validators'

describe('validateAmount', () => {
  it('accepts positive integer', () => expect(validateAmount(100)).toBe(100))
  it('rejects zero', () => expect(() => validateAmount(0)).toThrow(/金額必須是正整數/))
  it('rejects negative', () => expect(() => validateAmount(-5)).toThrow(/金額必須是正整數/))
  it('rejects float', () => expect(() => validateAmount(10.5)).toThrow(/金額必須是正整數/))
  it('respects custom field label', () => {
    expect(() => validateAmount(0, '欠款')).toThrow(/欠款必須是正整數/)
  })
})

describe('validateName', () => {
  it('trims and returns', () => expect(validateName('  Coco ', '名稱')).toBe('Coco'))
  it('rejects empty', () => expect(() => validateName('', '帳本名稱')).toThrow(/帳本名稱不能為空/))
  it('rejects whitespace-only', () => expect(() => validateName('   ', '帳本名稱')).toThrow(/帳本名稱不能為空/))
  it('rejects too long', () => {
    expect(() => validateName('x'.repeat(33), '帳本名稱')).toThrow(/帳本名稱最長 32 字/)
  })
  it('respects custom maxLen', () => {
    expect(() => validateName('xxx', '名', 2)).toThrow(/名最長 2 字/)
  })
  it('accepts at limit', () => {
    expect(validateName('x'.repeat(32), '名')).toBe('x'.repeat(32))
  })
})

describe('validateTransactionInput', () => {
  const baseValid = {
    amount: 100,
    description: ' 午餐 ',
    category: 'food',
    splitType: 'half' as const,
    payerId: 'user-a',
    transactedAt: new Date('2026-05-03'),
  }

  it('happy path: trims description, accepts valid category', () => {
    const r = validateTransactionInput(baseValid)
    expect(r.description).toBe('午餐')
    expect(r.category).toBe('food')
  })
  it('falls back unknown category to other', () => {
    const r = validateTransactionInput({ ...baseValid, category: 'bogus' })
    expect(r.category).toBe('other')
  })
  it('rejects empty description', () => {
    expect(() => validateTransactionInput({ ...baseValid, description: '   ' })).toThrow(/描述不能為空/)
  })
  it('rejects settle category', () => {
    expect(() => validateTransactionInput({ ...baseValid, category: 'settle' })).toThrow(/不可使用此分類/)
  })
  it('rejects invalid amount', () => {
    expect(() => validateTransactionInput({ ...baseValid, amount: 0 })).toThrow(/金額必須是正整數/)
  })
})

describe('validateSettlementInput', () => {
  const baseValid = {
    amount: 100,
    payerId: 'user-a',
    settledAt: new Date('2026-05-03'),
  }
  it('accepts minimal valid input', () => {
    const r = validateSettlementInput(baseValid)
    expect(r.amount).toBe(100)
    expect(r.note).toBeNull()
  })
  it('trims note and keeps non-empty', () => {
    const r = validateSettlementInput({ ...baseValid, note: ' partial ' })
    expect(r.note).toBe('partial')
  })
  it('whitespace-only note becomes null', () => {
    const r = validateSettlementInput({ ...baseValid, note: '   ' })
    expect(r.note).toBeNull()
  })
  it('rejects invalid amount', () => {
    expect(() => validateSettlementInput({ ...baseValid, amount: -1 })).toThrow(/金額必須是正整數/)
  })
})
```

- [ ] **Step 3: Refactor `actions/transaction.ts`**

Replace the inline validation in `createTransaction`:

```ts
// OLD:
//   if (!Number.isInteger(input.amount) || input.amount <= 0) { throw new Error('金額必須是正整數') }
//   const description = input.description.trim()
//   if (!description) throw new Error('描述不能為空')
//   const category = isValidCategoryId(input.category) ? input.category : 'other'
//   if (category === 'settle') throw new Error('不可使用此分類')
//
// NEW (top of function, after auth):
import { validateTransactionInput } from '@/lib/validators'
// ...
const validated = validateTransactionInput(input)
// then use validated.amount, validated.description, validated.category, etc.
```

Apply the same pattern to `editTransaction` (uses the same validation block).

- [ ] **Step 4: Refactor `actions/settlement.ts`**

Replace inline validation in `createSettlement` and `editSettlement` (if it exists):

```ts
import { validateSettlementInput } from '@/lib/validators'
// ...
const validated = validateSettlementInput({
  amount: input.amount,
  payerId: input.payerId,
  settledAt: input.settledAt,
  note: input.note,
})
```

- [ ] **Step 5: Refactor `actions/group.ts` and `actions/profile.ts`**

`updateGroupName`:

```ts
import { validateName } from '@/lib/validators'
// ...
const trimmed = validateName(name, '帳本名稱')
// then use `trimmed` in the .set({ name: trimmed }) call
```

`updateDisplayName`: same pattern with `'顯示名稱'` label.

`createGroup` (in group.ts) — use `validateName(name, '帳本名稱')` if it currently has any inline validation; if not, leave it (it doesn't need stricter validation for Phase 1e).

- [ ] **Step 6: Verify**

Run: `npx vitest run` — expect 89 passing (67 prior + 22 new validator tests).
Run: `npx tsc --noEmit` — 0 errors.
Run: `npm run build` — pass.

- [ ] **Step 7: Commit**

```bash
git add lib/validators.ts tests/validators.test.ts actions/transaction.ts actions/settlement.ts actions/group.ts actions/profile.ts
git commit -m "feat(validators): extract input validation to lib/validators.ts + tests"
```

---

## Task 7: Mock supabase + db harness for action tests

A reusable test harness that lets us call server actions in vitest without a real DB. Mocks: auth (`getUser`), Drizzle query builder (chainable methods), `db.transaction`, and `revalidatePath`.

**Files:**

- Create: `tests/_mocks/supabase.ts`
- Create: `tests/_mocks/db.ts`

- [ ] **Step 1: Create `tests/_mocks/supabase.ts`**

```ts
import { vi } from 'vitest'

export interface MockUser {
  id: string
  email?: string
}

interface MockState {
  user: MockUser | null
}

export const mockState: MockState = { user: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockState.user } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  })),
}))

export function setMockUser(user: MockUser | null) {
  mockState.user = user
}

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))
```

- [ ] **Step 2: Create `tests/_mocks/db.ts`**

```ts
import { vi } from 'vitest'

/**
 * Returns a chainable query mock. Each call to a query builder method (.select, .from,
 * .where, etc.) returns `this`. The terminal methods (.limit, .returning, .execute) resolve
 * to whatever you queue via `queueResult`.
 */
function createQueryMock() {
  const queue: unknown[][] = []
  const builder: Record<string, unknown> = {}

  const chainable = ['select', 'from', 'where', 'set', 'values', 'orderBy', 'innerJoin', 'leftJoin']
  for (const m of chainable) {
    builder[m] = vi.fn(() => builder)
  }

  // Terminals — return resolved promises
  builder.limit = vi.fn(() => Promise.resolve(queue.shift() ?? []))
  builder.returning = vi.fn(() => Promise.resolve(queue.shift() ?? []))
  builder.execute = vi.fn(() => Promise.resolve(queue.shift() ?? []))
  // For inserts/updates that don't chain returning, the chain itself is the promise
  // (Drizzle returns a thenable). Provide .then so `await db.update(...).set(...).where(...)` works.
  builder.then = vi.fn((onFulfilled: (v: unknown) => unknown) => {
    return Promise.resolve(queue.shift() ?? []).then(onFulfilled)
  })

  return { builder, queueResult: (value: unknown[]) => queue.push(value) }
}

const queryMock = createQueryMock()

export const mockDb = {
  select: vi.fn(() => queryMock.builder),
  insert: vi.fn(() => queryMock.builder),
  update: vi.fn(() => queryMock.builder),
  delete: vi.fn(() => queryMock.builder),
  execute: vi.fn(),
  // transaction: just call the callback with `this` (so nested ops use the same builder)
  transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
}

vi.mock('@/lib/db/client', () => ({ db: mockDb }))

/**
 * Queue a result to be returned by the next terminal (.limit / .returning / await).
 * Call once per expected DB read inside the action under test, in order.
 */
export function queueDbResult(rows: unknown[]) {
  queryMock.queueResult(rows)
}

/** Reset all mock state between tests. */
export function resetDbMocks() {
  Object.values(mockDb).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as { mockReset: () => void }).mockReset()
  })
  // Re-initialize behaviors
  mockDb.select.mockImplementation(() => queryMock.builder)
  mockDb.insert.mockImplementation(() => queryMock.builder)
  mockDb.update.mockImplementation(() => queryMock.builder)
  mockDb.delete.mockImplementation(() => queryMock.builder)
  mockDb.transaction.mockImplementation(async (fn) => fn(mockDb))
}
```

> Note: This is a deliberately simple mock — it doesn't preserve query semantics, just lets us assert that the right method calls happened in the right order, and lets us inject canned results. For more realistic SQL-level testing, a future phase could spin up a Postgres test container, but that's out of scope here.

- [ ] **Step 3: Verify the mocks compile**

Run: `npx tsc --noEmit` — 0 errors.

- [ ] **Step 4: Commit**

```bash
git add tests/_mocks/supabase.ts tests/_mocks/db.ts
git commit -m "test(infra): mock harness for supabase + Drizzle in action tests"
```

---

## Task 8: Integration tests for transaction + settlement actions

Cover happy path + key error paths for the 6 transaction/settlement write actions: createTransaction, editTransaction, softDeleteTransaction, createSettlement, editSettlement, softDeleteSettlement.

**Files:**

- Create: `tests/actions-transaction.test.ts`
- Create: `tests/actions-settlement.test.ts`

- [ ] **Step 1: Create `tests/actions-transaction.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createTransaction, editTransaction, softDeleteTransaction } from '@/actions/transaction'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createTransaction', () => {
  it('happy path: validates, inserts, recalcs', async () => {
    queueDbResult([GROUP])              // group lookup
    queueDbResult([{ id: 'tx-1' }])     // insert returning
    // recalcGroupBalance issues an .execute(...) — needs no result for our purposes

    const result = await createTransaction({
      amount: 100,
      description: '午餐',
      category: 'food',
      splitType: 'half',
      payerId: 'user-a',
      transactedAt: new Date('2026-05-03'),
    })

    expect(result).toEqual({ id: 'tx-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
    })).rejects.toThrow('Unauthorized')
  })

  it('throws on invalid amount', async () => {
    queueDbResult([GROUP])
    await expect(createTransaction({
      amount: 0, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
    })).rejects.toThrow(/金額必須是正整數/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])  // empty group lookup
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-a', transactedAt: new Date(),
    })).rejects.toThrow('找不到家計簿')
  })

  it('throws when payer not in group', async () => {
    queueDbResult([GROUP])
    await expect(createTransaction({
      amount: 100, description: 'x', category: 'food',
      splitType: 'half', payerId: 'user-stranger', transactedAt: new Date(),
    })).rejects.toThrow('付款人不在家計簿內')
  })
})

describe('editTransaction', () => {
  it('happy path: soft-deletes old + inserts new in one transaction', async () => {
    queueDbResult([GROUP])               // group lookup
    queueDbResult([{ id: 'tx-old' }])    // old row update returning (proves it existed)
    queueDbResult([{ id: 'tx-new' }])    // new row insert returning

    const result = await editTransaction({
      oldId: 'tx-old',
      amount: 200,
      description: 'updated',
      category: 'food',
      splitType: 'half',
      payerId: 'user-a',
      transactedAt: new Date('2026-05-03'),
    })

    expect(result).toEqual({ id: 'tx-new' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()  // atomic
  })

  it('throws if old row not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // update returning empty
    await expect(editTransaction({
      oldId: 'tx-missing', amount: 200, description: 'x',
      category: 'food', splitType: 'half', payerId: 'user-a',
      transactedAt: new Date(),
    })).rejects.toThrow('找不到該筆紀錄')
  })
})

describe('softDeleteTransaction', () => {
  it('happy path: marks deleted_at, recalcs', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'tx-1' }])  // update returning

    await softDeleteTransaction('tx-1')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(softDeleteTransaction('tx-missing')).rejects.toThrow('找不到該筆紀錄')
  })
})
```

- [ ] **Step 2: Create `tests/actions-settlement.test.ts`**

Mirror the transaction test structure for settlement actions:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createSettlement, softDeleteSettlement, editSettlement } from '@/actions/settlement'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createSettlement', () => {
  it('happy path', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'set-1' }])
    const r = await createSettlement({
      amount: 50,
      payerId: 'user-a',
      settledAt: new Date('2026-05-03'),
    })
    expect(r).toEqual({ id: 'set-1' })
  })
  it('throws on invalid amount', async () => {
    queueDbResult([GROUP])
    await expect(createSettlement({
      amount: 0, payerId: 'user-a', settledAt: new Date(),
    })).rejects.toThrow(/金額必須是正整數/)
  })
  it('throws if payer not in group', async () => {
    queueDbResult([GROUP])
    await expect(createSettlement({
      amount: 50, payerId: 'user-stranger', settledAt: new Date(),
    })).rejects.toThrow('付款人不在家計簿內')
  })
})

describe('softDeleteSettlement', () => {
  it('happy path', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'set-1' }])
    await softDeleteSettlement('set-1')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })
  it('throws if not found', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(softDeleteSettlement('missing')).rejects.toThrow('找不到該筆紀錄')
  })
})

describe('editSettlement', () => {
  it('happy path: soft-deletes old + inserts new atomically', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'set-old' }])  // delete returning
    queueDbResult([{ id: 'set-new' }])  // insert returning
    const r = await editSettlement({
      oldId: 'set-old',
      amount: 75,
      payerId: 'user-a',
      settledAt: new Date('2026-05-03'),
    })
    expect(r).toEqual({ id: 'set-new' })
  })
})
```

> Note: read each action file's signature first (especially `editSettlement` if it exists) and adapt the test inputs to match. If a method doesn't exist or has a different signature than the test assumes, STOP and report — the action layer is the source of truth.

- [ ] **Step 3: Verify**

Run: `npx vitest run` — expect 89 + ~16 = ~105 passing. The exact number depends on how the mock results align; treat any failure as a real signal (either the mock harness needs tweaking or the action behavior differs from spec).

If a test fails because the mock harness doesn't capture the right call sequence, simplify the test (assert on the result + that `db.transaction` was called, drop the deep call-count assertions) rather than building out more mock infrastructure.

- [ ] **Step 4: Commit**

```bash
git add tests/actions-transaction.test.ts tests/actions-settlement.test.ts
git commit -m "test(actions): integration tests for transaction + settlement write actions"
```

---

## Task 9: Tests for group + profile actions + final verification

Smaller batch — 4 actions: `createGroup`, `updateGroupName`, `updateDisplayName`. (`getMyGroup` is a read action; skip.)

**Files:**

- Create: `tests/actions-group.test.ts`

- [ ] **Step 1: Create `tests/actions-group.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, queueDbResult, resetDbMocks } from './_mocks/db'
import { createGroup, updateGroupName } from '@/actions/group'
import { updateDisplayName } from '@/actions/profile'

const VIEWER = { id: 'user-a', email: 'a@example.com' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

describe('createGroup', () => {
  it('happy path: creates group + balance row', async () => {
    queueDbResult([])  // existing-group lookup → none
    queueDbResult([{ id: 'grp-new', name: '我們家', memberA: 'user-a', memberB: null }])  // insert returning
    queueDbResult([])  // groupBalance insert (no returning)

    const g = await createGroup('我們家')
    expect(g.id).toBe('grp-new')
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })
  it('throws if user already in a group', async () => {
    queueDbResult([{ id: 'existing-grp' }])
    await expect(createGroup('新家')).rejects.toThrow('Already in a group')
  })
})

describe('updateGroupName', () => {
  it('happy path', async () => {
    queueDbResult([{ id: 'grp-1' }])  // update returning
    const r = await updateGroupName('  新名稱 ')
    expect(r).toEqual({ ok: true })
    // Trimmed value should be passed to .set — check via the mock's call args if needed.
  })
  it('rejects empty', async () => {
    await expect(updateGroupName('   ')).rejects.toThrow(/帳本名稱不能為空/)
  })
  it('rejects too long', async () => {
    await expect(updateGroupName('x'.repeat(33))).rejects.toThrow(/帳本名稱最長 32 字/)
  })
  it('throws if no group found', async () => {
    queueDbResult([])
    await expect(updateGroupName('OK')).rejects.toThrow('找不到家計簿')
  })
})

describe('updateDisplayName', () => {
  it('happy path', async () => {
    queueDbResult([{ id: 'user-a' }])
    const r = await updateDisplayName(' Coco ')
    expect(r).toEqual({ ok: true })
  })
  it('rejects empty', async () => {
    await expect(updateDisplayName('  ')).rejects.toThrow(/顯示名稱不能為空/)
  })
  it('throws if profile not found', async () => {
    queueDbResult([])
    await expect(updateDisplayName('Coco')).rejects.toThrow('找不到個人資料')
  })
})
```

- [ ] **Step 2: Run all tests + final verification**

Run: `npx vitest run` — expect ~115 passing.
Run: `npx tsc --noEmit` — 0 errors.
Run: `npm run build` — pass.

- [ ] **Step 3: Manual E2E (real-time)**

Two browser tabs, both logged in as different members of the same group:

```
□ Tab A creates a transaction → Tab B sees it prepend with 1s yellow flash
□ Tab A edits a transaction → Tab B sees: old row fade out, new row prepend with flash
□ Tab A deletes a transaction → Tab B sees row fade out 0.5s then vanish
□ Tab A creates a settlement → Tab B sees ↺ row prepend with flash
□ Tab A edits/deletes a settlement → Tab B reflects similarly
□ After ANY tab A mutation → Tab B's balance card cross-fades to new value
□ Disconnect WiFi on Tab B for 30s → reconnect → list refetches latest 20 (no errors)
□ With filter active on Tab B's /records:
   - Tab A creates a tx that MATCHES filter → Tab B sees it
   - Tab A creates a tx that does NOT match → Tab B does NOT see it (silently dropped)
□ No browser console errors during any of the above
```

- [ ] **Step 4: Manual E2E (pg_cron)**

After running `npm run db:migrate`:

```
□ Connect to Supabase SQL editor
□ Run: SELECT * FROM cron.job WHERE jobname = 'cleanup-soft-deleted';
□ Expect: one row with schedule '0 3 * * 0' and the DELETE command
□ (Optional) Manually trigger: SELECT cron.alter_job(<jobid>, schedule := '* * * * *') to run-soon, then revert
```

- [ ] **Step 5: Commit + final wrap-up**

```bash
git add tests/actions-group.test.ts
git commit -m "test(actions): integration tests for group + profile write actions"
```

If any small fixes were needed during E2E:

```bash
git commit --allow-empty -m "chore: phase 1e complete — realtime + cron + action tests"
```

---

## Task 10: Dashboard filter parity with /records

Mirror the 1d work on the dashboard: add a 「篩選 ›」 entry next to the existing 「最近紀錄」 label, hold local filter state, render `FilterSheet`, pass filter to `TransactionFeed`. State is per-page (no cross-page memory) — same as /records.

**Files:**

- Modify: `app/(dashboard)/dashboard/_components/Dashboard.tsx`

- [ ] **Step 1: Lift filter state into `Dashboard.tsx`**

Add imports:

```ts
import { FilterSheet } from '@/app/(dashboard)/records/_components/FilterSheet'
import { defaultFilter, isFilterActive, type TxnFilter } from '@/lib/filter'
```

Add state alongside the existing sheet states:

```ts
const [filterOpen, setFilterOpen] = useState(false)
const [filter, setFilter] = useState<TxnFilter | null>(null)
const filterActive = filter !== null && isFilterActive(filter)
```

Update `sheetOpen` to include `filterOpen`:

```ts
const sheetOpen = addOpen || editingTx !== null || editingSettlement !== null || filterOpen
```

- [ ] **Step 2: Replace the existing 「最近紀錄」 label with the same header pattern as RecordsList**

Find the `label` prop on `<TransactionFeed>`:

```tsx
        label={
          <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
            最近紀錄
          </span>
        }
```

Replace with a flex row that includes the 篩選 button (same shape as RecordsList header but inline as the feed `label`):

```tsx
        label={
          <div className="flex items-end justify-between">
            <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
              最近紀錄
            </span>
            <button
              onClick={() => setFilterOpen(true)}
              className="text-xs font-medium pb-px cursor-pointer bg-transparent border-0 flex items-center gap-1"
              style={{ color: 'var(--ink-2)' }}
              aria-label="開啟篩選"
            >
              篩選{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
            </button>
          </div>
        }
```

- [ ] **Step 3: Pass `filter` to `TransactionFeed`**

```tsx
      <TransactionFeed
        initial={recent}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        filter={filter ?? undefined}
        label={...}
        emptyState={<EmptyState onAdd={() => setAddOpen(true)} />}
      />
```

- [ ] **Step 4: Render `<FilterSheet>` at the bottom alongside the other sheets**

```tsx
      <FilterSheet
        open={filterOpen}
        current={filter ?? defaultFilter()}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilter(isFilterActive(next) ? next : null)
          setFilterOpen(false)
        }}
      />
```

- [ ] **Step 5: Verify**

Run: `npm run build` — pass.
Run: `npx vitest run` — expect ~115 passing (no new tests).

- [ ] **Step 6: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/Dashboard.tsx'
git commit -m "feat(filter): parity — add 篩選 entry to dashboard's 最近紀錄 header"
```

---

## Acceptance criteria (Phase 1e Done)

- [ ] `RealtimeProvider` subscribes to `CashTransactions` / `Settlements` / `GroupBalance` for the user's group
- [ ] Partner INSERT → row prepends with 1s 淡黃 highlight (no toast/sound)
- [ ] Partner soft-delete (UPDATE with deletedAt) → row fades out 0.5s then removes
- [ ] Partner balance change → balance card cross-fades to new value
- [ ] Filter-aware: realtime events for non-matching rows are silently dropped on /records
- [ ] WebSocket reconnect → page 1 refetched (no UI flash)
- [ ] pg_cron job `cleanup-soft-deleted` scheduled (`0 3 * * 0`)
- [ ] `lib/validators.ts` covers transaction, settlement, name with full unit tests
- [ ] All write server actions use the shared validators
- [ ] Integration tests cover happy + key error paths for: createTransaction, editTransaction, softDeleteTransaction, createSettlement, editSettlement, softDeleteSettlement, createGroup, updateGroupName, updateDisplayName
- [ ] Dashboard's 「最近紀錄」 header has 篩選 entry (parity with /records); state is per-page
- [ ] Build + typecheck + all tests pass

---

## Phase 1e → Phase 2 handoff notes

Phase 1 is complete. Phase 2 starts:
- Asset management (cars first): basic CRUD + fuel-log time-series
- Asset relation on transactions
- Per-asset spend dashboard
- Other asset types (house, child, insurance) iterate after car
