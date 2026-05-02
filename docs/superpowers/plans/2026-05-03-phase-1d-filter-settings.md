# Phase 1d — Filter Sheet (/records) + Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two independent features that close out Phase 1's UI surface:

1. **Filter sheet on `/records`** — add a 「篩選 >」 entry to the records page header that opens a bottom sheet for narrowing the feed by 誰付的 (single) / 分攤 (single) / 分類 (multi). The 「篩選」 label gets a `•` dot when any filter is active. Filter state is in-memory, not persisted across sessions.

2. **Full Settings page** — flesh out `/settings` per design spec §6.2: tappable 帳本名稱 row, read-only 成員 list with both members' avatar/name/email, tappable 顯示名稱 row, the existing Logout button, and footer.

**Architecture:**

- *Filter:* server-side via UNION SQL. `listTransactionsPaged` accepts a `filter?: TxnFilter` argument; the dynamic WHERE clauses are appended to each branch (transactions branch gets all three dimensions; settlements branch gets the 誰付 dimension and is excluded entirely when 分攤 ≠ 全部 or any 分類 is selected, since those dimensions don't apply to settlements). `loadMoreTransactions` accepts the filter and passes it through. `TransactionFeed` becomes filter-aware: when a `filter` prop changes, it refetches page 1 with the new filter and replaces its items.
- *Settings:* the page becomes a server component that fetches the group + partner profile and renders a new client `SettingsContent` component. Two new server actions (`updateGroupName`, `updateDisplayName`) handle writes. A small reusable `EditTextSheet` provides the bottom-sheet inline edit pattern (matches AddSheet / SettlementSheet style).

**Tech Stack:** Next.js 16 App Router · React 19 · Drizzle ORM (raw SQL on the UNION) · existing Tailwind tokens · existing `lib/categories.ts`.

**Visual reference:** [docs/superpowers/specs/2026-05-02-phase-1-transactions-design.md](../specs/2026-05-02-phase-1-transactions-design.md) §5 (Filter), §6 (Settings).

**Builds on Phase 1c:** Reuses `lib/db/queries/transactions.ts`, `app/(dashboard)/_components/TransactionFeed.tsx`, `app/(dashboard)/records/_components/RecordsList.tsx`, `app/(dashboard)/dashboard/_components/SheetBackdrop.tsx`.

**Out of scope (deferred to 1e):**
- Filter on dashboard's 「最近紀錄」 (intentionally — dashboard shows recent only, no filter pressure)
- Real-time
- pg_cron cleanup
- 法律聲明 link target (footer text only — link href is `#` placeholder)
- 帳本頭像底色自定 / 推播設定 / theme / 匯出

---

## File structure overview

**New:**

- `lib/filter.ts` — filter types + helpers (pure)
- `tests/filter.test.ts` — unit tests for the helpers
- `app/(dashboard)/records/_components/FilterSheet.tsx` — bottom-sheet UI
- `app/(dashboard)/_components/EditTextSheet.tsx` — shared inline-edit sheet (name, display name)
- `app/(dashboard)/settings/_components/SettingsContent.tsx` — client component owning the edit sheets
- `actions/profile.ts` — `updateDisplayName` server action

**Modified:**

- `lib/db/queries/transactions.ts` — `listTransactionsPaged` accepts `filter?: TxnFilter`; SQL gets dynamic WHERE clauses
- `actions/transaction.ts` — `loadMoreTransactions` signature gains `filter?: TxnFilter`
- `actions/group.ts` — adds `updateGroupName` server action
- `app/(dashboard)/_components/TransactionFeed.tsx` — accepts optional `filter` prop; refetches page 1 when it changes; passes filter to load-more
- `app/(dashboard)/records/_components/RecordsList.tsx` — adds 「紀錄」 header row with 「篩選 >」 entry + dot indicator, manages filter state, renders FilterSheet
- `app/(dashboard)/settings/page.tsx` — fetches group + partner profile + viewer profile; renders new `SettingsContent` instead of inline JSX

---

## Task 1: Filter types + helpers (`lib/filter.ts`) + tests

Pure module — no DB, no React. Defines the in-memory filter shape and the helpers used by both UI (FilterSheet) and server (listTransactionsPaged).

**Files:**

- Create: `lib/filter.ts`
- Create: `tests/filter.test.ts`

- [ ] **Step 1: Create `lib/filter.ts`**

```ts
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'

/** Single-select dimensions use 'all' to mean "no filter". Multi-select dimensions use empty Set. */
export type PayerFilter = 'all' | 'mine' | 'theirs'
export type SplitFilter = 'all' | SplitType  // 'all' | 'all_mine' | 'all_theirs' | 'half'

export interface TxnFilter {
  payer: PayerFilter
  split: SplitFilter
  /** Empty set = no category filter. Includes only transaction CategoryIds; 'settle' is never selectable. */
  categories: Set<CategoryId>
}

export function defaultFilter(): TxnFilter {
  return { payer: 'all', split: 'all', categories: new Set() }
}

/** True if any dimension would narrow the feed. */
export function isFilterActive(f: TxnFilter): boolean {
  return f.payer !== 'all' || f.split !== 'all' || f.categories.size > 0
}

/** True if ANY transaction-only dimension is active (split or categories). Used to decide
 *  whether settlements should be hidden — settlements have no split_type / category, so
 *  applying those dims to them is meaningless and the safest UX is to hide them. */
export function hidesSettlements(f: TxnFilter): boolean {
  return f.split !== 'all' || f.categories.size > 0
}

/** Serialize for transport over server-action boundary (Sets aren't structured-clonable
 *  through Server Action arg serialization in some Next versions; we send arrays). */
export interface TxnFilterWire {
  payer: PayerFilter
  split: SplitFilter
  categories: CategoryId[]
}

export function toWire(f: TxnFilter): TxnFilterWire {
  return { payer: f.payer, split: f.split, categories: Array.from(f.categories) }
}

export function fromWire(w: TxnFilterWire): TxnFilter {
  return { payer: w.payer, split: w.split, categories: new Set(w.categories) }
}
```

- [ ] **Step 2: Create `tests/filter.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { defaultFilter, isFilterActive, hidesSettlements, toWire, fromWire } from '@/lib/filter'

describe('defaultFilter', () => {
  it('is inactive', () => {
    expect(isFilterActive(defaultFilter())).toBe(false)
  })
  it('does not hide settlements', () => {
    expect(hidesSettlements(defaultFilter())).toBe(false)
  })
})

describe('isFilterActive', () => {
  it('payer alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), payer: 'mine' })).toBe(true)
  })
  it('split alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), split: 'half' })).toBe(true)
  })
  it('categories alone activates', () => {
    expect(isFilterActive({ ...defaultFilter(), categories: new Set(['food']) })).toBe(true)
  })
})

describe('hidesSettlements', () => {
  it('payer-only does NOT hide settlements (settlements have a payer)', () => {
    expect(hidesSettlements({ ...defaultFilter(), payer: 'mine' })).toBe(false)
  })
  it('split active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), split: 'half' })).toBe(true)
  })
  it('categories active hides settlements', () => {
    expect(hidesSettlements({ ...defaultFilter(), categories: new Set(['food']) })).toBe(true)
  })
})

describe('wire round-trip', () => {
  it('preserves all dimensions', () => {
    const f = { payer: 'theirs' as const, split: 'half' as const, categories: new Set(['food', 'transit'] as const) }
    expect(fromWire(toWire(f))).toEqual(f)
  })
})
```

- [ ] **Step 3: Verify tests + typecheck**

Run: `npx vitest run tests/filter.test.ts`
Expected: 8 tests pass.

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add lib/filter.ts tests/filter.test.ts
git commit -m "feat(filter): TxnFilter types + helpers (defaultFilter, isFilterActive, hidesSettlements)"
```

---

## Task 2: Filter-aware `listTransactionsPaged` + `loadMoreTransactions`

Both branches of the UNION accept dynamic filter clauses. Settlements branch is dropped entirely when transaction-only dims are active. 誰付 ('mine'/'theirs') resolves to a specific user.id at the action layer (where we know group.memberA / memberB and viewer.id).

**Files:**

- Modify: `lib/db/queries/transactions.ts`
- Modify: `actions/transaction.ts`

- [ ] **Step 1: Extend `listTransactionsPaged` in `lib/db/queries/transactions.ts`**

Add the import at the top:

```ts
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
```

Define the resolved-filter shape (used by the query layer — UI/wire shapes live in `lib/filter.ts`):

```ts
/**
 * Resolved filter: 誰付 dimension is collapsed to a concrete user id (or null = no filter).
 * 分攤 / categories arrive as concrete arrays (empty array = no filter).
 */
export interface ResolvedTxnFilter {
  paidBy: string | null
  splitTypes: SplitType[]   // empty = all
  categories: CategoryId[]  // empty = all
  /** True when settlements should be excluded entirely. */
  excludeSettlements: boolean
}
```

Replace the `listTransactionsPaged` signature and body. The cursor logic stays the same; we add filter clauses per branch. Settlements branch is wrapped in `excludeSettlements ? sql`` : sql`UNION ALL ... `` to avoid emitting an empty branch when settlements should be hidden.

```ts
export async function listTransactionsPaged(
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
  filter?: ResolvedTxnFilter,
): Promise<FeedRow[]> {
  const txCursor = cursor
    ? sql`AND (transacted_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``
  const setCursor = cursor
    ? sql`AND (settled_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

  // Per-branch filter clauses
  const txPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``
  const txSplit = filter && filter.splitTypes.length > 0
    ? sql`AND split_type = ANY(${filter.splitTypes}::split_type[])`
    : sql``
  const txCategory = filter && filter.categories.length > 0
    ? sql`AND category = ANY(${filter.categories}::text[])`
    : sql``

  const setPayer = filter?.paidBy ? sql`AND paid_by = ${filter.paidBy}` : sql``

  // Drop the settlements branch entirely when 分攤 / 分類 dims are active.
  const settlementsBranch = filter?.excludeSettlements
    ? sql``
    : sql`
      UNION ALL

      SELECT
        id, amount,
        NULL::split_type AS split_type,
        COALESCE(note, '還款') AS description,
        'settle' AS category,
        paid_by,
        settled_at AS transacted_at,
        created_at,
        'settlement'::text AS kind
      FROM "Settlements"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${setCursor}
      ${setPayer}
    `

  const rows = await db.execute<{
    id: string
    amount: number
    split_type: 'all_mine' | 'all_theirs' | 'half' | null
    description: string
    category: string
    paid_by: string
    transacted_at: Date
    created_at: Date
    kind: FeedKind
  }>(sql`
    SELECT * FROM (
      SELECT
        id, amount, split_type, description, category, paid_by,
        transacted_at, created_at,
        'transaction'::text AS kind
      FROM "CashTransactions"
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      ${txCursor}
      ${txPayer}
      ${txSplit}
      ${txCategory}
      ${settlementsBranch}
    ) AS feed
    ORDER BY transacted_at DESC, created_at DESC
    LIMIT ${limit}
  `)

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.split_type,
    description: r.description,
    category: r.category,
    paidBy: r.paid_by,
    transactedAt: r.transacted_at instanceof Date ? r.transacted_at : new Date(r.transacted_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    kind: r.kind,
  }))
}
```

- [ ] **Step 2: Update `loadMoreTransactions` in `actions/transaction.ts`**

Add the import:

```ts
import { fromWire, hidesSettlements, type TxnFilterWire } from '@/lib/filter'
import type { ResolvedTxnFilter } from '@/lib/db/queries/transactions'
```

Replace `loadMoreTransactions` to accept the optional filter and resolve 誰付 to a concrete user id:

```ts
export async function loadMoreTransactions(
  cursor: TxnCursor | null,
  limit = 20,
  filterWire?: TxnFilterWire,
): Promise<PagedTxnRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  let resolved: ResolvedTxnFilter | undefined
  if (filterWire) {
    const f = fromWire(filterWire)
    let paidBy: string | null = null
    if (f.payer === 'mine') paidBy = user.id
    else if (f.payer === 'theirs') {
      const partner = group.memberA === user.id ? group.memberB : group.memberA
      // If no partner yet, "對方" filter matches nothing — emit an impossible UUID so
      // the SQL returns 0 rows instead of crashing on a NULL comparison.
      paidBy = partner ?? '00000000-0000-0000-0000-000000000000'
    }
    resolved = {
      paidBy,
      splitTypes: f.split === 'all' ? [] : [f.split],
      categories: Array.from(f.categories),
      excludeSettlements: hidesSettlements(f),
    }
  }

  const rows = await listTransactionsPaged(group.id, cursor, limit, resolved)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    kind: r.kind,
  }))
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build`
Expected: pass.

Run: `npx vitest run`
Expected: 53 passing (45 prior + 8 new from Task 1).

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries/transactions.ts actions/transaction.ts
git commit -m "feat(filter): server-side filter on UNION feed (誰付/分攤/分類)"
```

---

## Task 3: `FilterSheet.tsx` component

Bottom-sheet UI per spec §5.2: 重設 / 篩選 / 套用 header (套用 in accent color), three sections of chips. Single-select chips for 誰付的 + 分攤; multi-select for 分類 (using `PICKABLE_CATEGORIES` from `lib/categories.ts`).

**Files:**

- Create: `app/(dashboard)/records/_components/FilterSheet.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'
import { defaultFilter, type TxnFilter, type PayerFilter, type SplitFilter } from '@/lib/filter'

interface Props {
  open: boolean
  /** Current applied filter — used to seed the draft when the sheet opens. */
  current: TxnFilter
  onClose: () => void
  /** Called with the new filter when the user taps 套用. The sheet does NOT close itself —
   *  the parent decides (typically: also call onClose). */
  onApply: (next: TxnFilter) => void
}

const PAYER_OPTIONS: { value: PayerFilter; label: string }[] = [
  { value: 'all',    label: '全部' },
  { value: 'mine',   label: '我' },
  { value: 'theirs', label: '對方' },
]

const SPLIT_OPTIONS: { value: SplitFilter; label: string }[] = [
  { value: 'all',         label: '全部' },
  { value: 'half',        label: '平分' },
  { value: 'all_mine',    label: '我的' },
  { value: 'all_theirs',  label: '對方的' },
]

export function FilterSheet({ open, current, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<TxnFilter>(current)

  // Re-seed the draft whenever the sheet (re-)opens — without this, dismissing without
  // applying and reopening would show the stale draft instead of the live state.
  useEffect(() => {
    if (open) setDraft({ ...current, categories: new Set(current.categories) })
  }, [open, current])

  if (!open) return null

  const toggleCategory = (id: CategoryId) => {
    const next = new Set(draft.categories)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraft({ ...draft, categories: next })
  }

  return (
    <>
      <SheetBackdrop onClick={onClose} />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] rounded-t-[20px] pb-6"
        style={{ background: 'var(--bg)', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
      >
        {/* Header: 重設 / 篩選 / 套用 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <button
            onClick={() => setDraft(defaultFilter())}
            className="text-sm font-medium bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            重設
          </button>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>篩選</div>
          <button
            onClick={() => onApply(draft)}
            className="text-sm font-semibold bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--accent)' }}
          >
            套用
          </button>
        </div>

        <div className="px-5 pt-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 誰付的 */}
          <Section title="誰付的">
            {PAYER_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={draft.payer === o.value}
                onClick={() => setDraft({ ...draft, payer: o.value })}
              />
            ))}
          </Section>

          {/* 分攤 */}
          <Section title="分攤">
            {SPLIT_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={draft.split === o.value}
                onClick={() => setDraft({ ...draft, split: o.value })}
              />
            ))}
          </Section>

          {/* 分類 (multi) */}
          <Section title="分類（可多選）">
            {PICKABLE_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                active={draft.categories.has(c.id)}
                onClick={() => toggleCategory(c.id)}
              />
            ))}
          </Section>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded-full text-xs font-medium cursor-pointer transition-colors"
      style={{
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-2)',
        border: '1px solid var(--hairline)',
      }}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass (component is unused yet — Task 4 wires it).

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/records/_components/FilterSheet.tsx'
git commit -m "feat(filter): FilterSheet bottom-sheet UI"
```

---

## Task 4: Wire filter into `RecordsList` + `TransactionFeed` filter prop

`RecordsList` gets a 「紀錄」 + 「篩選 >」 header row (replacing the existing 「{n} 筆已載入」 subtitle), holds the filter state, and renders `FilterSheet`. `TransactionFeed` gets an optional `filter` prop — when it changes, refetch page 1 and replace items; also pass to load-more.

**Files:**

- Modify: `app/(dashboard)/_components/TransactionFeed.tsx`
- Modify: `app/(dashboard)/records/_components/RecordsList.tsx`

- [ ] **Step 1: Add `filter` prop to `TransactionFeed`**

Find the import block and add:

```ts
import { toWire, type TxnFilter } from '@/lib/filter'
```

Update the `Props` interface:

```ts
interface Props {
  initial: PagedTxnRow[]
  pageSize: number
  emptyState: React.ReactNode
  onItemClick: (tx: PagedTxnRow) => void
  label?: React.ReactNode
  /** Optional filter. When this object reference changes, the feed refetches page 1 with
   *  the new filter and replaces its items. Pass `undefined` for "no filter". */
  filter?: TxnFilter
}
```

Update the function signature:

```ts
export function TransactionFeed({ initial, pageSize, emptyState, onItemClick, label, filter }: Props) {
```

Replace the existing useEffect that resets to `initial`. We want two behaviors:
- When `initial` changes (router.refresh after a mutation) → reset to it (only when `filter` is undefined, since with an active filter the server-side `initial` is unfiltered and we'd lose the filter view)
- When `filter` changes → refetch page 1 with filter

```tsx
  // Resync to initial only when no filter is active (filter mode owns the items list).
  useEffect(() => {
    if (!filter) {
      setItems(initial)
      setHasMore(initial.length === pageSize)
    }
  }, [initial, pageSize, filter])

  // When the filter changes (including becoming undefined → defined), refetch page 1.
  useEffect(() => {
    if (!filter) return  // handled by the previous effect via `initial`
    setError('')
    startLoading(async () => {
      try {
        const fresh = await loadMoreTransactions(null, pageSize, toWire(filter))
        setItems(fresh)
        setHasMore(fresh.length === pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- filter identity drives this effect
  }, [filter, pageSize])
```

Update `handleLoadMore` to thread the filter through:

```tsx
  const handleLoadMore = () => {
    if (items.length === 0) return
    setError('')
    const last = items[items.length - 1]
    startLoading(async () => {
      try {
        const more = await loadMoreTransactions(
          { transactedAt: last.transactedAt, createdAt: last.createdAt },
          pageSize,
          filter ? toWire(filter) : undefined,
        )
        setItems((cur) => [...cur, ...more])
        setHasMore(more.length === pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      }
    })
  }
```

Important: `if (items.length === 0)` early-returns load-more, but with filter active and 0 results the user has nothing to scroll to so the empty state shows. The `emptyState` rendering at items.length === 0 is fine for this case too (it's the same empty UI; "no records" or "no records match" both communicate emptiness — design spec doesn't differentiate).

- [ ] **Step 2: Update `RecordsList`**

Replace the file content:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { SettlementSheet, type SettlementSheetInitial } from '@/app/(dashboard)/dashboard/_components/SettlementSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { FilterSheet } from './FilterSheet'
import { defaultFilter, isFilterActive, type TxnFilter } from '@/lib/filter'
import type { PagedTxnRow } from '@/actions/transaction'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number
}

export function RecordsList({ initial, pageSize }: Props) {
  const router = useRouter()
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editingSettlement, setEditingSettlement] = useState<SettlementSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  // `null` = no filter active (TransactionFeed owns the unfiltered initial list).
  // Once the user applies any filter, this becomes a TxnFilter object.
  const [filter, setFilter] = useState<TxnFilter | null>(null)

  const sheetOpen = editingTx !== null || editingSettlement !== null || adding || filterOpen

  const handleItemClick = (tx: PagedTxnRow) => {
    if (tx.kind === 'settlement') {
      setEditingSettlement({
        id: tx.id,
        amount: tx.amount,
        payerId: tx.paidBy,
        settledAt: tx.transactedAt,
      })
    } else {
      setEditingTx({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        category: tx.category,
        splitType: tx.splitType!,
        payerId: tx.paidBy,
        transactedAt: tx.transactedAt,
      })
    }
  }

  const handleSheetClose = () => {
    setEditingTx(null)
    setEditingSettlement(null)
    setAdding(false)
  }

  const handleMutated = () => router.refresh()

  const filterActive = filter !== null && isFilterActive(filter)

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-2 flex items-end justify-between">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          紀錄
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className="text-xs font-medium pb-1 cursor-pointer bg-transparent border-0 flex items-center gap-1"
          style={{ color: 'var(--ink-2)' }}
          aria-label="開啟篩選"
        >
          篩選{filterActive && <span style={{ color: 'var(--accent)' }}>•</span>} <span style={{ color: 'var(--ink-3)' }}>›</span>
        </button>
      </div>

      <TransactionFeed
        initial={initial}
        pageSize={pageSize}
        onItemClick={handleItemClick}
        filter={filter ?? undefined}
        emptyState={
          <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            {filterActive ? '沒有符合條件的紀錄' : '還沒有紀錄。按下方 + 記第一筆吧。'}
          </div>
        }
      />

      <BottomNav onAddClick={() => setAdding(true)} hideFab={sheetOpen} />

      <AddSheet
        open={adding || editingTx !== null}
        onClose={handleSheetClose}
        initial={editingTx ?? undefined}
        onMutated={handleMutated}
      />
      <SettlementSheet
        open={editingSettlement !== null}
        onClose={handleSheetClose}
        initial={editingSettlement}
        onMutated={handleMutated}
      />
      <FilterSheet
        open={filterOpen}
        current={filter ?? defaultFilter()}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          // Setting back to a default filter clears (becomes null) so TransactionFeed
          // re-syncs to the unfiltered server-rendered initial list.
          setFilter(isFilterActive(next) ? next : null)
          setFilterOpen(false)
        }}
      />
    </div>
  )
}
```

Note: the previous 「{n} 筆已載入」 subtitle is removed — the design spec doesn't show it and it gets in the way of the new header alignment. The 「紀錄」 + 「篩選 >」 header sits on the same baseline (flex items-end).

- [ ] **Step 3: Verify build + tests**

Run: `npm run build`
Expected: pass.

Run: `npx vitest run`
Expected: 53 passing.

- [ ] **Step 4: Commit**

```bash
git add 'app/(dashboard)/_components/TransactionFeed.tsx' 'app/(dashboard)/records/_components/RecordsList.tsx'
git commit -m "feat(filter): /records header with 篩選 entry, dot indicator, FilterSheet wiring"
```

---

## Task 5: `updateGroupName` + `updateDisplayName` server actions

Two write actions. Both validate trimmed name (length 1–32), require auth, return `{ ok: true }` on success.

**Files:**

- Modify: `actions/group.ts`
- Create: `actions/profile.ts`

- [ ] **Step 1: Add `updateGroupName` to `actions/group.ts`**

Append to the existing file:

```ts
export async function updateGroupName(name: string): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('帳本名稱不能為空')
  if (trimmed.length > 32) throw new Error('帳本名稱最長 32 字')

  const result = await db
    .update(oikosGroups)
    .set({ name: trimmed })
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .returning({ id: oikosGroups.id })

  if (result.length === 0) throw new Error('找不到家計簿')
  return { ok: true }
}
```

You'll need to add `revalidatePath` import + call:

```ts
import { revalidatePath } from 'next/cache'
// ... at the end of updateGroupName before `return { ok: true }`:
revalidatePath('/settings')
```

- [ ] **Step 2: Create `actions/profile.ts`**

```ts
'use server'

import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function updateDisplayName(name: string): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('顯示名稱不能為空')
  if (trimmed.length > 32) throw new Error('顯示名稱最長 32 字')

  const result = await db
    .update(profiles)
    .set({ displayName: trimmed })
    .where(eq(profiles.id, user.id))
    .returning({ id: profiles.id })

  if (result.length === 0) throw new Error('找不到個人資料')

  // Display name shows in headers / rows across the app.
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/settings')
  return { ok: true }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add actions/group.ts actions/profile.ts
git commit -m "feat(settings): updateGroupName + updateDisplayName server actions"
```

---

## Task 6: Shared `EditTextSheet` bottom-sheet component

A small reusable bottom sheet for inline single-field edits (group name, display name). Same backdrop/animation as AddSheet/SettlementSheet, but only contains a label, an input, and confirm/cancel buttons.

**Files:**

- Create: `app/(dashboard)/_components/EditTextSheet.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'

interface Props {
  open: boolean
  /** Sheet header label (e.g. "帳本名稱"). */
  title: string
  /** Initial value to seed the input when open transitions to true. */
  initialValue: string
  /** Called when the user submits a new value. Resolve to close the sheet; reject to show error. */
  onSubmit: (value: string) => Promise<void>
  onClose: () => void
  /** Optional placeholder. Defaults to the title. */
  placeholder?: string
  /** Optional max length hint (visual only — server enforces). */
  maxLength?: number
}

export function EditTextSheet({ open, title, initialValue, onSubmit, onClose, placeholder, maxLength = 32 }: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue)
    setError('')
    const t = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 250)
    return () => clearTimeout(t)
  }, [open, initialValue])

  if (!open) return null

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (!trimmed) { setError('不能為空'); return }
    startTransition(async () => {
      try {
        await onSubmit(trimmed)
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '儲存失敗')
      }
    })
  }

  return (
    <>
      <SheetBackdrop onClick={pending ? () => {} : onClose} />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] rounded-t-[20px] pb-6 px-5 pt-5"
        style={{ background: 'var(--bg)', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
      >
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>{title}</div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !pending) {
              e.preventDefault()
              handleConfirm()
            }
          }}
          placeholder={placeholder ?? title}
          className="w-full h-12 px-3 rounded-xl text-sm bg-transparent outline-none"
          style={{
            border: '1px solid var(--hairline)',
            color: 'var(--ink)',
            background: 'var(--surface)',
          }}
        />
        {error && (
          <div className="text-xs mt-2" style={{ color: 'var(--debit)' }}>{error}</div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={pending || !value.trim()}
            className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
          <button
            onClick={onClose}
            disabled={pending}
            className="h-[46px] px-4 rounded-xl text-sm font-medium cursor-pointer"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink-2)',
              border: '1px solid var(--hairline)',
            }}
          >
            取消
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass (component is unused yet — Task 7 wires it).

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/_components/EditTextSheet.tsx'
git commit -m "feat(settings): shared EditTextSheet for inline single-field edits"
```

---

## Task 7: Settings page rebuild — server fetch + `SettingsContent` client

Server component fetches viewer profile + group + partner profile. New client component renders the four sections (帳本 / 成員 / 個人 / 登出) and owns the two edit sheets.

**Files:**

- Modify: `app/(dashboard)/settings/page.tsx`
- Create: `app/(dashboard)/settings/_components/SettingsContent.tsx`

- [ ] **Step 1: Replace `app/(dashboard)/settings/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles, oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'
import { SettingsContent, type PartnerInfo, type ViewerInfo } from './_components/SettingsContent'

interface AuthUser { id: string; email?: string }

async function getEmail(userId: string, fallback?: string): Promise<string> {
  // auth.users.email is the source of truth, but we already have it from the auth context
  // for the viewer; for the partner we don't, so we fall back to profile.displayName + '' (no email shown).
  // Keep the contract simple: caller passes whatever email it has access to.
  return fallback ?? ''
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [viewerProfile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const partnerId = group.memberA === user.id ? group.memberB : group.memberA
  let partnerProfile: typeof viewerProfile | null = null
  let partnerEmail: string | null = null
  if (partnerId) {
    const [p] = await db.select().from(profiles).where(eq(profiles.id, partnerId)).limit(1)
    partnerProfile = p ?? null
    // Fetch the partner's auth email via Supabase Admin; if unavailable, fall back to null.
    // Phase 1d keeps it simple: we read from auth.users via the service-role client only if
    // configured; otherwise show the displayName line without email. Implement as best-effort.
    try {
      const { data } = await supabase.auth.admin.getUserById(partnerId)
      partnerEmail = data?.user?.email ?? null
    } catch {
      partnerEmail = null
    }
  }

  const viewer: ViewerInfo = {
    id: user.id,
    displayName: viewerProfile?.displayName ?? '?',
    email: user.email ?? '',
  }
  const partner: PartnerInfo | null = partnerProfile
    ? {
        id: partnerProfile.id,
        displayName: partnerProfile.displayName,
        email: partnerEmail,
      }
    : null

  return (
    <div className="relative min-h-screen pb-[92px]">
      <SettingsContent
        viewer={viewer}
        partner={partner}
        groupName={group.name}
      />
      <BottomNavSkeleton />
    </div>
  )
}
```

Note on `auth.admin.getUserById`: the project's Supabase server client is created from the request cookie context. If admin operations aren't enabled in this client, the try/catch swallows the error and partner email is just `null`. UI handles `null` by hiding the email line. (If you discover the existing supabase server helper does NOT have admin scope, that's fine — the catch covers it; partner email simply won't show. We're not adding service-role infra in this phase.)

- [ ] **Step 2: Create `app/(dashboard)/settings/_components/SettingsContent.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { EditTextSheet } from '@/app/(dashboard)/_components/EditTextSheet'
import { LogoutButton } from './LogoutButton'
import { updateGroupName } from '@/actions/group'
import { updateDisplayName } from '@/actions/profile'

export interface ViewerInfo { id: string; displayName: string; email: string }
export interface PartnerInfo { id: string; displayName: string; email: string | null }

interface Props {
  viewer: ViewerInfo
  partner: PartnerInfo | null
  groupName: string
}

export function SettingsContent({ viewer, partner, groupName }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<null | 'group' | 'name'>(null)

  const handleClose = () => setEditing(null)
  const refresh = () => router.refresh()

  return (
    <>
      <div className="px-5 pt-[60px] pb-4">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          設定
        </div>
      </div>

      {/* 帳本 */}
      <Section title="帳本">
        <Row
          label="帳本名稱"
          value={groupName}
          onClick={() => setEditing('group')}
        />
      </Section>

      {/* 成員 */}
      <Section title="成員">
        <div
          className="rounded-[20px] overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <MemberRow
            who="M"
            initial={viewer.displayName[0]?.toUpperCase() ?? '?'}
            displayName={viewer.displayName}
            email={viewer.email}
            youSuffix
          />
          {partner && (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)' }} />
              <MemberRow
                who="T"
                initial={partner.displayName[0]?.toUpperCase() ?? '?'}
                displayName={partner.displayName}
                email={partner.email ?? ''}
              />
            </>
          )}
        </div>
      </Section>

      {/* 個人 */}
      <Section title="個人">
        <Row
          label="顯示名稱"
          value={viewer.displayName}
          onClick={() => setEditing('name')}
        />
      </Section>

      <div className="px-4 pb-2 mt-4">
        <LogoutButton />
      </div>
      <div
        className="text-[11px] text-center mt-2 leading-relaxed tracking-[0.3px] pb-8"
        style={{ color: 'var(--ink-3)' }}
      >
        Futari · v0.1.0 · <a href="#" className="underline" style={{ color: 'var(--ink-3)' }}>法律聲明</a>
      </div>

      <EditTextSheet
        open={editing === 'group'}
        title="帳本名稱"
        initialValue={groupName}
        onClose={handleClose}
        onSubmit={async (v) => {
          await updateGroupName(v)
          refresh()
        }}
      />
      <EditTextSheet
        open={editing === 'name'}
        title="顯示名稱"
        initialValue={viewer.displayName}
        onClose={handleClose}
        onSubmit={async (v) => {
          await updateDisplayName(v)
          refresh()
        }}
      />
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 mt-2 mb-5">
      <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-4 rounded-[20px] text-left bg-transparent cursor-pointer"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</div>
      <div className="text-sm flex items-center gap-2" style={{ color: 'var(--ink-3)' }}>
        <span style={{ color: 'var(--ink-2)' }}>「{value}」</span>
        <span>›</span>
      </div>
    </button>
  )
}

function MemberRow({
  who, initial, displayName, email, youSuffix,
}: { who: 'M' | 'T'; initial: string; displayName: string; email: string; youSuffix?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <Avatar who={who} initial={initial} size={40} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {displayName}{youSuffix && <span className="ml-1" style={{ color: 'var(--ink-3)' }}>（你）</span>}
        </div>
        {email && (
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>{email}</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build`
Expected: pass.

Run: `npx vitest run`
Expected: 53 passing.

- [ ] **Step 4: Commit**

```bash
git add 'app/(dashboard)/settings/page.tsx' 'app/(dashboard)/settings/_components/SettingsContent.tsx'
git commit -m "feat(settings): full settings page (帳本 / 成員 / 個人 / 登出)"
```

---

## Task 8: Final verification + manual E2E

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: 53 passing.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. No new routes.

- [ ] **Step 4: Manual E2E — Filter on /records**

Start: `npm run dev`. Pre-condition: a few transactions exist with mixed payers / split types / categories, plus at least one settlement.

```
□ /records → header shows 「紀錄」 left, 「篩選 ›」 right (no dot)
□ Tap 「篩選 ›」 → bottom sheet slides up with three sections
□ 重設 / 篩選 / 套用 row at top; 套用 in accent color
□ 誰付的: 全部 / 我 / 對方 (single-select chips, default 全部 active)
□ 分攤: 全部 / 平分 / 我的 / 對方的 (single-select)
□ 分類: 餐飲 / 交通 / 日用品 / 娛樂 / 醫療 / 居家 / 禮物 / 其他 (multi-select; tap toggles)
□ Select 誰付=我 + 套用 → sheet closes, list shows only my transactions + my settlements; header shows 「篩選•›」
□ Re-open filter → previous selections preserved
□ Add 分類=餐飲 + 套用 → list shows only my transactions in 餐飲; settlements disappear
□ Tap 重設 + 套用 → list returns to all rows including settlements; dot disappears
□ Apply a filter that matches nothing → empty state shows 「沒有符合條件的紀錄」
□ With filter active, tap a transaction row → AddSheet opens in edit mode (filter remains active after close)
□ With filter active, tap a settlement row → SettlementSheet opens (only possible if settlements visible, i.e. only 誰付 filter active)
□ Apply a filter, then add a new transaction via FAB → list refreshes; if the new tx matches the filter it appears, otherwise it doesn't
□ Pagination: 套用 a filter that has many results → 載入更多 button works and respects the filter
```

- [ ] **Step 5: Manual E2E — Settings**

```
□ /settings → 帳本 / 成員 / 個人 sections render in order
□ 帳本名稱 row shows current name in 「」 quotes with › chevron
□ Tap 帳本名稱 row → EditTextSheet opens with current name pre-filled + selected
□ Clear text → 儲存 disabled
□ Type new name → 儲存 → sheet closes → row updates immediately (router.refresh)
□ 成員 section: viewer row shows 「{name}（你）」 + email; partner row shows partner name + email if available, just name if admin lookup failed
□ Tap 顯示名稱 row → EditTextSheet opens with viewer's current display name
□ Save new display name → row updates → 成員 section's viewer name also updates → /dashboard avatar initial may also update on next render
□ Logout button still works (unchanged)
□ Footer reads 「Futari · v0.1.0 · 法律聲明」
□ 法律聲明 link href is "#" placeholder (no real page yet)
```

- [ ] **Step 6: Final wrap-up commit (if any small fixes were needed)**

If clean:

```bash
git commit --allow-empty -m "chore: phase 1d complete — filter sheet + settings"
```

---

## Acceptance criteria (Phase 1d Done)

- [ ] /records header has 「篩選 ›」 entry; dot indicator appears when any filter is active
- [ ] FilterSheet bottom sheet with 重設 / 篩選 / 套用 header and three filter sections
- [ ] Filter applies server-side via UNION SQL (transactions get all three dims; settlements respect 誰付 only)
- [ ] Settlements hidden when 分攤 ≠ 全部 OR any 分類 selected
- [ ] Filter state in-memory only (no URL persistence; reload = no filter)
- [ ] Filter persists across edit/add operations on /records
- [ ] /settings has 帳本 / 成員 / 個人 sections per spec §6.2
- [ ] 帳本名稱 + 顯示名稱 editable via shared EditTextSheet
- [ ] Member list shows both members read-only with avatar + name + email
- [ ] Server actions validate length (1–32 chars), trim, error gracefully
- [ ] All 53 tests pass; build + typecheck clean

---

## Phase 1d → 1e handoff notes

Phase 1e will add:
- Real-time (Supabase postgres_changes on CashTransactions / Settlements / GroupBalance)
- pg_cron weekly cleanup of `deleted_at` rows older than 1 year
- Real 法律聲明 page or modal (currently href="#")
- Optional: 帳本頭像底色自定 (deferred from spec §6.2 footer comment)
