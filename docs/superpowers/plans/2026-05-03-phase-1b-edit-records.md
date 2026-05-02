# Phase 1b — Edit / Delete + Records Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap any transaction row to edit it (or delete it via a destructive button); browse the full transaction history at `/records` with month-grouped sections and "載入更多" pagination (20 at a time).

**Architecture:** Editing is implemented as **soft-delete-of-old + insert-of-new + balance recalc**, all wrapped in a single Drizzle transaction (matches design spec §3.4 and §9.2). The existing `AddSheet` is refactored to a polymorphic create/edit form via an optional `initial` prop. The Records page is a server component that fetches the first 20, then a client component manages pagination state and calls a `loadMoreTransactions` server action with a composite cursor `(transactedAt, createdAt)` to avoid same-day skipping. Month sections are computed client-side from the flat list.

**Tech Stack:** Next.js 16 App Router · React 19 (useTransition for mutations) · Drizzle ORM (composite tuple cursor via raw SQL) · existing Tailwind v4 design tokens.

**Visual reference:** [docs/superpowers/specs/2026-05-02-phase-1-transactions-design.md](../specs/2026-05-02-phase-1-transactions-design.md) §2.5 (lazy load), §2.6 (list item), §3.4 (edit flow), §9.2 (atomic soft-delete + insert).

**Builds on Phase 1a:** Reuses `lib/balance.ts`, `lib/categories.ts`, `lib/db/queries/{balance,transactions}.ts`, `actions/transaction.ts` (already has `softDeleteTransaction`), and the `AddSheet` / `CompactRow` / `RecentList` components.

**Out of scope (deferred):**

- Filter bottom sheet — Phase 1d
- Settlement (button still disabled stub) — Phase 1c
- Real-time — Phase 1e
- Drag-to-dismiss the AddSheet — polish for later
- Pull-to-refresh on dashboard — polish for later
- Records page filters chip pill — Phase 1d (the page just shows everything)

---

## File structure overview

**Modified:**
- `actions/transaction.ts` — append `editTransaction(oldId, input)`. Returns the new `TxnRow`.
- `actions/transaction.ts` — append `loadMoreTransactions(cursor, limit)` (client-callable pagination wrapper)
- `lib/db/queries/transactions.ts` — append `listTransactionsPaged(groupId, cursor, limit)` (composite tuple cursor)
- `app/(dashboard)/dashboard/_components/AddSheet.tsx` — add optional `initial` prop, prefill on open, swap header / save text / action when in edit mode, render delete button at bottom in edit mode
- `app/(dashboard)/dashboard/_components/Dashboard.tsx` — manage `editingTx` state alongside `addOpen`, pass to AddSheet
- `app/(dashboard)/dashboard/_components/CompactRow.tsx` — add optional `onClick` prop, become a button when present
- `app/(dashboard)/dashboard/_components/RecentList.tsx` — accept `onItemClick` callback, wire row clicks
- `app/(dashboard)/_components/BottomNav.tsx` — update 紀錄 tab href from `/coming-soon?next=list` to `/records`

**New:**
- `app/(dashboard)/records/page.tsx` — server component, fetches first 20 + renders RecordsList
- `app/(dashboard)/records/_components/RecordsList.tsx` — client orchestrator (paginate state + month grouping + AddSheet for edit)
- `app/(dashboard)/records/_components/MonthSection.tsx` — section header (月份 + 筆數 + 總額)
- `lib/groupByMonth.ts` — pure function for client-side month grouping (TDD)
- `__tests__/groupByMonth.test.ts`

---

## Task 1: `groupByMonth` pure helper (TDD)

Used client-side by RecordsList to fold a sorted flat list into month-grouped sections. Pure + TDD'd because off-by-one bugs in date logic are easy to introduce.

**Files:**
- Create: `lib/groupByMonth.ts`
- Create: `__tests__/groupByMonth.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// __tests__/groupByMonth.test.ts
import { describe, it, expect } from 'vitest'
import { groupByMonth, monthLabel } from '@/lib/groupByMonth'

interface T { id: string; transactedAt: string; amount: number }

describe('groupByMonth', () => {
  it('returns empty array for no items', () => {
    expect(groupByMonth<T>([], (t) => t.transactedAt)).toEqual([])
  })

  it('groups items by YYYY-MM', () => {
    const items: T[] = [
      { id: 'a', transactedAt: '2026-05-02T00:00:00Z', amount: 100 },
      { id: 'b', transactedAt: '2026-05-01T00:00:00Z', amount: 200 },
      { id: 'c', transactedAt: '2026-04-30T00:00:00Z', amount: 300 },
    ]
    const groups = groupByMonth(items, (t) => t.transactedAt)
    expect(groups).toHaveLength(2)
    expect(groups[0].monthKey).toBe('2026-05')
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups[1].monthKey).toBe('2026-04')
    expect(groups[1].items.map((i) => i.id)).toEqual(['c'])
  })

  it('preserves input order within each group', () => {
    // Already-sorted-desc input → output preserves that order per group
    const items: T[] = [
      { id: 'z', transactedAt: '2026-05-15T00:00:00Z', amount: 1 },
      { id: 'y', transactedAt: '2026-05-10T00:00:00Z', amount: 1 },
      { id: 'x', transactedAt: '2026-05-05T00:00:00Z', amount: 1 },
    ]
    const groups = groupByMonth(items, (t) => t.transactedAt)
    expect(groups[0].items.map((i) => i.id)).toEqual(['z', 'y', 'x'])
  })

  it('handles boundary day (UTC vs local TZ note)', () => {
    // ISO "2026-05-01T00:00:00Z" is UTC midnight. In Asia/Taipei (UTC+8) that's 2026-05-01 08:00 local.
    // Both interpretations bucket as 2026-05. We rely on the ISO prefix slice for stable bucketing.
    const items: T[] = [
      { id: 'a', transactedAt: '2026-05-01T00:00:00Z', amount: 1 },
    ]
    const groups = groupByMonth(items, (t) => t.transactedAt)
    expect(groups[0].monthKey).toBe('2026-05')
  })
})

describe('monthLabel', () => {
  it('formats YYYY-MM as Chinese month label', () => {
    expect(monthLabel('2026-05')).toBe('五月 2026')
    expect(monthLabel('2026-12')).toBe('十二月 2026')
    expect(monthLabel('2026-01')).toBe('一月 2026')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/groupByMonth.test.ts`
Expected: FAIL with "Cannot find module '@/lib/groupByMonth'"

- [ ] **Step 3: Implement `lib/groupByMonth.ts`**

```ts
export interface MonthGroup<T> {
  monthKey: string  // 'YYYY-MM'
  items: T[]
}

/**
 * Bucket items by `YYYY-MM` derived from a getter on each item.
 * Output groups are in input order (caller is responsible for desc sort).
 * Items within each group also preserve input order.
 */
export function groupByMonth<T>(
  items: T[],
  getISODate: (item: T) => string,
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  let current: MonthGroup<T> | null = null
  for (const item of items) {
    const monthKey = getISODate(item).slice(0, 7) // 'YYYY-MM'
    if (!current || current.monthKey !== monthKey) {
      current = { monthKey, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
]

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/groupByMonth.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/groupByMonth.ts __tests__/groupByMonth.test.ts
git commit -m "feat(lib): groupByMonth helper for client-side section grouping"
```

---

## Task 2: `editTransaction` server action

The atomic soft-delete-of-old + insert-of-new + balance-recalc, all in one DB transaction. Returns just `{ id }` — clients trigger UI refresh via `router.refresh()` (cheaper than threading the full row through types).

**Files:**
- Modify: `actions/transaction.ts`

- [ ] **Step 1: Append the function to `actions/transaction.ts`**

Add this at the end of the file:

```ts
export interface EditTransactionInput {
  oldId: string
  amount: number
  description: string
  category: CategoryId | string
  splitType: SplitType
  payerId: string
  transactedAt: Date
}

export async function editTransaction(input: EditTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate (mirror createTransaction)
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額必須是正整數')
  }
  const description = input.description.trim()
  if (!description) throw new Error('描述不能為空')
  const category = isValidCategoryId(input.category) ? input.category : 'other'
  if (category === 'settle') throw new Error('不可使用此分類')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  const [created] = await db.transaction(async (tx) => {
    // Soft-delete old (must belong to this group + still active)
    const deleted = await tx
      .update(cashTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(cashTransactions.id, input.oldId),
        eq(cashTransactions.groupId, group.id),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })
    if (deleted.length === 0) throw new Error('找不到該筆紀錄')

    // Insert new
    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: input.payerId,
        amount: input.amount,
        splitType: input.splitType,
        description,
        category,
        transactedAt: input.transactedAt,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')

  return { id: created.id }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add actions/transaction.ts
git commit -m "feat(actions): editTransaction (atomic soft-delete + insert + recalc)"
```

---

## Task 3: AddSheet edit mode (refactor to polymorphic create/edit)

Add an optional `initial` prop. When set: prefill all fields, change header to 「編輯紀錄」, change save button to call `editTransaction(initial.id, ...)` instead of `createTransaction`, render a destructive 「刪除這筆」 button at the bottom of the scrolled body.

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/AddSheet.tsx`

- [ ] **Step 1: Update the imports + types at the top of the file**

Replace the import line for `createTransaction`:

```ts
import { createTransaction, editTransaction, softDeleteTransaction } from '@/actions/transaction'
```

Then update the `Props` interface:

```ts
export interface AddSheetInitial {
  id: string
  amount: number
  description: string
  category: string
  splitType: SplitType
  payerId: string
  transactedAt: string  // ISO
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AddSheetInitial
  /** Called after a successful create/edit/delete. Caller refreshes its own data. */
  onMutated?: () => void
}
```

- [ ] **Step 2: Replace state init + reset effect to handle prefill**

Find the existing state hooks block:

```ts
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId>('food')
  const [split, setSplit] = useState<SplitType>('half')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(TODAY_ISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)
```

Keep them all. Then REPLACE the existing `useEffect(() => { ... if (open) { ... } }, [open])` with this version that handles prefill:

```ts
  // Reset / prefill on open. Re-runs if `initial` changes.
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(String(initial.amount))
      setDesc(initial.description)
      setCategory(
        (PICKABLE_CATEGORIES.find((c) => c.id === initial.category)?.id as CategoryId) ?? 'food',
      )
      setSplit(initial.splitType)
      setPayerWho(initial.payerId === viewer.id ? 'M' : 'T')
      setDate(initial.transactedAt.slice(0, 10))
    } else {
      setAmount('')
      setDesc('')
      setCategory('food')
      setSplit('half')
      setPayerWho('M')
      setDate(TODAY_ISO())
    }
    setShowCal(false)
    setError('')
    const t = setTimeout(() => amountInputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [open, initial, viewer.id])
```

- [ ] **Step 3: Replace `handleSave` to branch on edit vs create**

Find the existing `handleSave` and replace with:

```ts
  const isEdit = !!initial

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError('請輸入金額'); return }
    if (!desc.trim()) { setError('請輸入描述'); return }
    if (payerWho === 'T' && !partner) { setError('伴侶尚未加入'); return }
    const payerId = payerWho === 'M' ? viewer.id : partner!.id
    const transactedAt = new Date(date + 'T00:00:00')

    startTransition(async () => {
      try {
        if (isEdit) {
          await editTransaction({
            oldId: initial!.id,
            amount: n,
            description: desc,
            category,
            splitType: split,
            payerId,
            transactedAt,
          })
        } else {
          await createTransaction({
            amount: n,
            description: desc,
            category,
            splitType: split,
            payerId,
            transactedAt,
          })
        }
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const handleDelete = () => {
    if (!isEdit) return
    if (!confirm('確定刪除這筆？')) return
    startTransition(async () => {
      try {
        await softDeleteTransaction(initial!.id)
        onMutated?.()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }
```

- [ ] **Step 4: Update the header text to swap on edit mode**

Find the header `<div>` containing 「新增紀錄」 and update the text:

```tsx
          <div
            className="text-base font-semibold tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit ? '編輯紀錄' : '新增紀錄'}
          </div>
```

- [ ] **Step 5: Add the 「刪除這筆」 button at the bottom of the scroll body (only in edit mode)**

Find the closing `</div>` of the date section (just before `<div className="h-6" />`). Insert the delete button BEFORE the `<div className="h-6" />`:

```tsx
          {isEdit && (
            <div className="px-5 pb-2">
              <button
                onClick={handleDelete}
                disabled={pending}
                className="w-full h-12 rounded-[14px] border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
                style={{
                  background: 'transparent',
                  color: '#B85A48',
                  border: '1px solid rgba(184, 90, 72, 0.25)',
                }}
              >
                刪除這筆
              </button>
            </div>
          )}

          <div className="h-6" />
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/AddSheet.tsx'
git commit -m "feat(add-sheet): polymorphic create/edit mode + delete button"
```

---

## Task 4: CompactRow tap-to-edit

Make rows tappable. The component becomes a `<button>` when an `onClick` is supplied; otherwise stays a `<div>` (so callers that don't want interaction don't pay for it).

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/CompactRow.tsx`

- [ ] **Step 1: Update the props interface to include optional `onClick`**

Find the existing `CompactRowProps`:

```ts
export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half'
    description: string
    category: string
    paidBy: string
    transactedAt: string
  }
  isLast: boolean
}
```

Add `onClick`:

```ts
export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half'
    description: string
    category: string
    paidBy: string
    transactedAt: string
  }
  isLast: boolean
  onClick?: () => void
}
```

- [ ] **Step 2: Update the component to render a button when `onClick` is provided**

Find the current return value (the outer `<div>` with `flex items-center gap-3 px-[14px] py-3`) and replace the entire return statement with:

```tsx
  const inner = (
    <>
      <CategoryChip categoryId={tx.category} size={32} />
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--ink)' }}>
          {tx.description}
        </div>
        <div
          className="text-[11px] flex items-center gap-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {dateLabel} · <Avatar who={payerIsViewer ? 'M' : 'T'} initial={payerInitial} size={12} /> {payerLabel}
        </div>
      </div>
      <div className="text-right">
        <div
          className="tnum text-sm font-medium tracking-[-0.2px]"
          style={{ fontFamily: 'var(--font-numeric)', color: 'var(--ink)' }}
        >
          NT${tx.amount.toLocaleString('en-US')}
        </div>
        <div className="tnum text-[10px] mt-px" style={{ color: dColor }}>
          {delta === 0 ? '—' : (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-US')}
        </div>
      </div>
    </>
  )

  const cls = "w-full flex items-center gap-3 px-[14px] py-3 text-left bg-transparent border-0"
  const style = { borderBottom: isLast ? 'none' : '1px solid var(--hairline)' }

  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} cursor-pointer transition-colors duration-100 hover:bg-[rgba(31,27,22,0.03)]`} style={style}>
        {inner}
      </button>
    )
  }

  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  )
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/CompactRow.tsx'
git commit -m "feat(row): make CompactRow tappable when onClick supplied"
```

---

## Task 5: Wire dashboard recent rows to open AddSheet in edit mode

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/RecentList.tsx`
- Modify: `app/(dashboard)/dashboard/_components/Dashboard.tsx`

- [ ] **Step 1: Update `RecentList` to accept and forward an item-click callback**

Replace the existing `RecentList.tsx` content with:

```tsx
'use client'

import Link from 'next/link'
import { CompactRow, type CompactRowProps } from './CompactRow'

interface Props {
  items: CompactRowProps['tx'][]
  onItemClick?: (item: CompactRowProps['tx']) => void
}

export function RecentList({ items, onItemClick }: Props) {
  return (
    <div className="pt-1 pb-5">
      <div className="flex items-center justify-between px-6 py-2.5">
        <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
          最近紀錄
        </span>
        <Link href="/records" className="text-[11px] no-underline" style={{ color: 'var(--ink-3)' }}>
          查看全部 →
        </Link>
      </div>
      <div
        className="mx-4 rounded-[18px] overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        {items.map((tx, i) => (
          <CompactRow
            key={tx.id}
            tx={tx}
            isLast={i === items.length - 1}
            onClick={onItemClick ? () => onItemClick(tx) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `Dashboard.tsx` to manage editing state + pass to AddSheet**

Replace the entire content of `Dashboard.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandHeader } from './BrandHeader'
import { BalanceHero } from './BalanceHero'
import { RecentList } from './RecentList'
import { EmptyState } from './EmptyState'
import { AddSheet, type AddSheetInitial } from './AddSheet'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import type { CompactRowProps } from './CompactRow'

export interface DashboardProps {
  balance: number
  recent: CompactRowProps['tx'][]
}

export function Dashboard({ balance, recent }: DashboardProps) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<AddSheetInitial | null>(null)

  const sheetOpen = addOpen || editing !== null

  const handleItemClick = (tx: CompactRowProps['tx']) => {
    setEditing({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
    })
  }

  const handleClose = () => {
    setAddOpen(false)
    setEditing(null)
  }

  // Server action revalidated already; refresh re-runs the server component.
  const handleMutated = () => router.refresh()

  return (
    <div className="relative min-h-screen pb-[92px]">
      <BrandHeader />
      <BalanceHero
        rawBalance={balance}
        onAddClick={() => setAddOpen(true)}
        onSettleClick={() => { /* Phase 1c */ }}
      />
      {recent.length === 0
        ? <EmptyState onAdd={() => setAddOpen(true)} />
        : <RecentList items={recent} onItemClick={handleItemClick} />
      }
      <BottomNav onAddClick={() => setAddOpen(true)} hideFab={sheetOpen} />
      <AddSheet
        open={sheetOpen}
        onClose={handleClose}
        initial={editing ?? undefined}
        onMutated={handleMutated}
      />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/RecentList.tsx' 'app/(dashboard)/dashboard/_components/Dashboard.tsx'
git commit -m "feat(dashboard): tap row to edit; route 查看全部 to /records"
```

---

## Task 6: `listTransactionsPaged` query (composite cursor)

Add a paginated query that uses a composite `(transactedAt, createdAt)` cursor so same-day transactions don't get skipped.

**Files:**
- Modify: `lib/db/queries/transactions.ts`

- [ ] **Step 1: Append types and function**

Add to `lib/db/queries/transactions.ts`:

```ts
import { sql } from 'drizzle-orm'

export interface TxnCursor {
  transactedAt: string  // ISO
  createdAt: string     // ISO
}

export interface TxnRowWithCreatedAt extends TxnRow {
  createdAt: Date
}

/**
 * Page through active transactions (newest first) using a composite (transactedAt, createdAt)
 * cursor to avoid skipping same-day rows. Pass `cursor=null` for the first page.
 */
export async function listTransactionsPaged(
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
): Promise<TxnRowWithCreatedAt[]> {
  const baseSelect = {
    id: cashTransactions.id,
    amount: cashTransactions.amount,
    splitType: cashTransactions.splitType,
    description: cashTransactions.description,
    category: cashTransactions.category,
    paidBy: cashTransactions.paidBy,
    transactedAt: cashTransactions.transactedAt,
    createdAt: cashTransactions.createdAt,
  }

  if (!cursor) {
    return db
      .select(baseSelect)
      .from(cashTransactions)
      .where(and(
        eq(cashTransactions.groupId, groupId),
        isNull(cashTransactions.deletedAt),
      ))
      .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
      .limit(limit)
  }

  // Tuple comparison: (transacted_at, created_at) < (cursor.t, cursor.c).
  // Pass ISO strings with explicit ::timestamptz casts so Postgres parses them correctly.
  return db
    .select(baseSelect)
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, groupId),
      isNull(cashTransactions.deletedAt),
      sql`(${cashTransactions.transactedAt}, ${cashTransactions.createdAt}) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`,
    ))
    .orderBy(desc(cashTransactions.transactedAt), desc(cashTransactions.createdAt))
    .limit(limit)
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add lib/db/queries/transactions.ts
git commit -m "feat(db): listTransactionsPaged with composite tuple cursor"
```

---

## Task 7: `loadMoreTransactions` server action

Client-callable wrapper for `listTransactionsPaged`. Authenticates, looks up group, returns serializable rows.

**Files:**
- Modify: `actions/transaction.ts`

- [ ] **Step 1: Append to `actions/transaction.ts`**

Add the import for the new query at the top of the file (alongside the existing `recalcGroupBalance` import):

```ts
import { listTransactionsPaged, type TxnCursor } from '@/lib/db/queries/transactions'
```

Then append at the end of the file:

```ts
export interface PagedTxnRow {
  id: string
  amount: number
  splitType: SplitType
  description: string
  category: string
  paidBy: string
  transactedAt: string  // ISO
  createdAt: string     // ISO (used as cursor part)
}

export async function loadMoreTransactions(
  cursor: TxnCursor | null,
  limit = 20,
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

  const rows = await listTransactionsPaged(group.id, cursor, limit)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add actions/transaction.ts
git commit -m "feat(actions): loadMoreTransactions paginated server action"
```

---

## Task 8: `MonthSection` component

Section header for the records list — shows 「{月份} {年}」 on the left and 「N 筆 · NT${total}」 on the right.

**Files:**
- Create: `app/(dashboard)/records/_components/MonthSection.tsx`

- [ ] **Step 1: Create the directory + file**

```tsx
'use client'

import { monthLabel } from '@/lib/groupByMonth'

interface Props {
  monthKey: string
  count: number
  totalAmount: number
}

export function MonthSection({ monthKey, count, totalAmount }: Props) {
  return (
    <div className="px-6 pt-4 pb-2 flex items-baseline justify-between">
      <span
        className="text-base font-medium tracking-tight"
        style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
      >
        {monthLabel(monthKey)}
      </span>
      <span className="tnum text-[11px]" style={{ color: 'var(--ink-3)' }}>
        {count} 筆 · NT${totalAmount.toLocaleString('en-US')}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass (no usages yet — type-check only).

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/records/_components/MonthSection.tsx'
git commit -m "feat(records): MonthSection header"
```

---

## Task 9: `RecordsList` client component

The orchestrator. Holds the loaded list, computes month groups, renders sections + rows, manages 「載入更多」 button, and opens the AddSheet for edit on row tap.

**Files:**
- Create: `app/(dashboard)/records/_components/RecordsList.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CompactRow, type CompactRowProps } from '@/app/(dashboard)/dashboard/_components/CompactRow'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { MonthSection } from './MonthSection'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { groupByMonth } from '@/lib/groupByMonth'
import { loadMoreTransactions, type PagedTxnRow } from '@/actions/transaction'

interface Props {
  initial: PagedTxnRow[]
  pageSize: number  // typically 20; receiving fewer = no more pages
}

export function RecordsList({ initial, pageSize }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<PagedTxnRow[]>(initial)
  const [hasMore, setHasMore] = useState(initial.length === pageSize)
  const [loading, startLoading] = useTransition()
  const [editing, setEditing] = useState<AddSheetInitial | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  // Reset items + hasMore whenever the server re-renders this component with fresh `initial`
  // (after router.refresh() following a mutation). This loses any "load more" position but
  // guarantees consistent state — acceptable for Phase 1b.
  useEffect(() => {
    setItems(initial)
    setHasMore(initial.length === pageSize)
  }, [initial, pageSize])

  const handleLoadMore = () => {
    if (items.length === 0) return
    const last = items[items.length - 1]
    startLoading(async () => {
      try {
        const more = await loadMoreTransactions(
          { transactedAt: last.transactedAt, createdAt: last.createdAt },
          pageSize,
        )
        setItems((cur) => [...cur, ...more])
        setHasMore(more.length === pageSize)
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗')
      }
    })
  }

  const handleItemClick = (tx: PagedTxnRow) => {
    setEditing({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
    })
  }

  const handleMutated = () => {
    // Server action already revalidated; refresh re-renders this server component
    // with new `initial`, the useEffect above resyncs local state.
    router.refresh()
  }

  const handleSheetClose = () => {
    setEditing(null)
    setAdding(false)
  }

  const sheetOpen = editing !== null || adding

  const groups = groupByMonth(items, (i) => i.transactedAt)

  return (
    <div className="relative min-h-screen pb-[92px]">
      <div className="px-5 pt-[60px] pb-2">
        <div
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          紀錄
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
          {items.length} 筆已載入
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
          還沒有紀錄。按下方 + 記第一筆吧。
        </div>
      ) : (
        <>
          {groups.map((g) => {
            const total = g.items.reduce((acc, t) => acc + t.amount, 0)
            return (
              <div key={g.monthKey}>
                <MonthSection monthKey={g.monthKey} count={g.items.length} totalAmount={total} />
                <div
                  className="mx-4 rounded-[18px] overflow-hidden"
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
                >
                  {g.items.map((tx, i) => (
                    <CompactRow
                      key={tx.id}
                      tx={tx as CompactRowProps['tx']}
                      isLast={i === g.items.length - 1}
                      onClick={() => handleItemClick(tx)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          <div className="px-4 pt-6 pb-2">
            {hasMore ? (
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="w-full h-11 rounded-[14px] text-sm font-medium cursor-pointer disabled:opacity-50"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  border: '1px solid var(--hairline)',
                }}
              >
                {loading ? '載入中…' : '載入更多'}
              </button>
            ) : (
              <div className="text-center text-[11px] py-3" style={{ color: 'var(--ink-3)' }}>
                已是最早的紀錄
              </div>
            )}
          </div>
        </>
      )}

      <BottomNav onAddClick={() => setAdding(true)} hideFab={sheetOpen} />

      <AddSheet
        open={sheetOpen}
        onClose={handleSheetClose}
        initial={editing ?? undefined}
        onMutated={handleMutated}
      />

      {error && (
        <div
          className="fixed left-1/2 top-4 z-[110] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass (no page importing it yet).

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/records/_components/RecordsList.tsx'
git commit -m "feat(records): RecordsList client orchestrator (paginate + edit)"
```

---

## Task 10: `/records` server page

Fetch the first page server-side and render `RecordsList`.

**Files:**
- Create: `app/(dashboard)/records/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { listTransactionsPaged } from '@/lib/db/queries/transactions'
import { RecordsList } from './_components/RecordsList'

const PAGE_SIZE = 20

export default async function RecordsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  const rows = await listTransactionsPaged(group.id, null, PAGE_SIZE)

  const initial = rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))

  return <RecordsList initial={initial} pageSize={PAGE_SIZE} />
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass; routes should now include `ƒ /records`.

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/records/page.tsx'
git commit -m "feat(records): /records server page (first 20 + RecordsList)"
```

---

## Task 11: Update bottom nav 紀錄 tab

Point the nav tab to the new page. Drop the `coming-soon?next=list` redirect.

**Files:**
- Modify: `app/(dashboard)/_components/BottomNav.tsx`

- [ ] **Step 1: Update the TABS constant**

Find:

```ts
  { id: 'list', label: '紀錄', href: '/coming-soon?next=list', icon: NavListIcon },
```

Replace with:

```ts
  { id: 'list', label: '紀錄', href: '/records', icon: NavListIcon },
```

- [ ] **Step 2: Update active-tab detection**

Find:

```ts
  const getActiveTab = (): typeof TABS[number]['id'] => {
    if (pathname === '/dashboard') return 'home'
    if (pathname === '/settings') return 'settings'
    return 'home'
  }
```

Replace with:

```ts
  const getActiveTab = (): typeof TABS[number]['id'] => {
    if (pathname === '/dashboard') return 'home'
    if (pathname === '/records') return 'list'
    if (pathname === '/settings') return 'settings'
    return 'home'
  }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add 'app/(dashboard)/_components/BottomNav.tsx'
git commit -m "feat(nav): point 紀錄 tab to /records (replaces coming-soon redirect)"
```

---

## Task 12: Final verification + manual E2E

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: all pass. Phase 1a had 38; Phase 1b adds 5 from `groupByMonth.test.ts` = **43 total**.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. Routes should now include:

- `/`
- `/sign-in`
- `/setup`
- `/auth/callback`
- `/invite/[token]`
- `/dashboard`
- `/records` (NEW)
- `/settings`
- `/coming-soon` (still exists for the assets tab)

- [ ] **Step 4: Manual E2E**

Start: `npm run dev`

Edit flow:
```
□ /dashboard with at least 1 transaction → tap any row → AddSheet opens with header「編輯紀錄」
□ All fields prefilled: amount, payer pill, description, category chip, split radio, date
□ Change amount → save → sheet closes → balance + list update accordingly
□ Tap row again → tap 「刪除這筆」 → browser confirm → confirm → sheet closes → row gone, balance updated
```

Records page:
```
□ Tap 紀錄 tab in bottom nav → navigates to /records
□ See up to 20 transactions grouped by month, each section with 「{月} {年}」 + 「N 筆 · NT$X」 right-aligned
□ Tap any row → edit sheet opens, prefilled
□ Edit + save → row reordered correctly (edit may move it to a different month if date changed)
□ Delete → row removed
□ If you have > 20 transactions: 「載入更多」 button at bottom → tap → next 20 appended
□ When fewer than 20 returned: button replaced with 「已是最早的紀錄」
□ Empty state (0 transactions): 「還沒有紀錄。回首頁記第一筆吧。」
```

Active-tab indicator:
```
□ On /records: 紀錄 tab is bold/dark, others muted
□ Tap 首頁 → back to dashboard, 首頁 active
```

Cross-page consistency:
```
□ Edit a transaction from /dashboard → navigate to /records → see the updated row at the right position
□ Edit from /records → navigate to /dashboard → see updated row in 最近紀錄 (top 5)
```

- [ ] **Step 5: Final wrap-up commit (only if any small fixes were needed)**

```bash
git commit --allow-empty -m "chore: phase 1b complete — edit/delete + records page"
```

---

## Acceptance criteria (Phase 1b Done)

- [x] Tap any transaction row (dashboard or /records) → AddSheet opens in edit mode with prefilled values
- [x] Save in edit mode → atomic soft-delete-old + insert-new + balance recalc; old id replaced
- [x] 「刪除這筆」 button in edit mode → confirm → soft-delete + balance recalc; row disappears
- [x] /records page exists, server-fetches first 20, displays month-grouped sections with subtotals
- [x] 「載入更多」 button paginates with composite cursor; correctly says 「已是最早的紀錄」 when exhausted
- [x] Bottom nav 紀錄 tab routes to /records (no longer coming-soon)
- [x] All tests pass (43 total)
- [x] Build + typecheck pass
- [x] Manual E2E verified by user

---

## Phase 1b → 1c handoff notes

Phase 1c will add:
- Settlement server actions (create + soft-delete)
- Settlement form inline-expansion within `BalanceHero` (replacing the disabled stub)
- 「全額 / 一半 / 整數」 quick-pick chip integration (math already in `lib/settlement.ts`)

Phase 1d will add:
- Filter bottom sheet on `/records` (誰付 / 分攤 / 分類)
- 「篩選 >」 link with dot indicator when applied
- Full settings page (group name edit, member list, profile edit)
