# Phase 1c — Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap the balance card → inline settlement form expands with the smart 「全額／一半／整數」 chips and viewer-flipped copy (「我還 多少？」 vs 「對方還了 多少？」). Confirm → settlement recorded, balance recalculated, the row appears in the list with the `↺` settle icon.

**Architecture:** Settlement records get a new server action (`createSettlement`) that's atomic with `recalcGroupBalance`. The list query (`listTransactionsPaged`) is widened to UNION `CashTransactions` + `Settlements`, with each row tagged via a `kind: 'transaction' | 'settlement'` discriminator. `BalanceHero` becomes a controlled card that toggles between balance display and inline `SettlementForm`; the form binds to the existing `lib/settlement.ts` chip math and dispatches the action.

**Tech Stack:** Next.js 16 App Router · React 19 · Drizzle ORM (raw SQL UNION via `sql\`\`` template) · existing Tailwind tokens · existing `lib/balance.ts` + `lib/settlement.ts`.

**Visual reference:** [docs/superpowers/specs/2026-05-02-phase-1-transactions-design.md](../specs/2026-05-02-phase-1-transactions-design.md) §4 (Settlement UX), §8.1 (`settle` category), §9.1 (balance recalc SQL).

**Builds on Phase 1b:** Reuses `lib/settlement.ts` (chip math), `lib/balance.ts`, `lib/db/queries/balance.ts` (recalc), `app/(dashboard)/_components/TransactionFeed.tsx`, `app/(dashboard)/dashboard/_components/BalanceHero.tsx` (the disabled `結算` button stub gets replaced).

**Out of scope (deferred):**

- Settlement edit / settlement delete UI — server action exists but no row-tap-to-delete or list-button (Phase 1d or later)
- Settlement note/memo input — schema has `note` column but the form doesn't expose it (default "還款" / "收款" is used)
- Filter sheet on /records — Phase 1d
- Real-time — Phase 1e

---

## File structure overview

**New:**
- `actions/settlement.ts` — `createSettlement` + `softDeleteSettlement`
- `app/(dashboard)/dashboard/_components/SettlementForm.tsx` — inline form (amount + chips + actions)

**Modified:**
- `lib/db/queries/transactions.ts` — `listTransactionsPaged` rewritten as UNION (transactions + settlements). Returns rows tagged with `kind`.
- `actions/transaction.ts` — `PagedTxnRow` gains `kind: 'transaction' | 'settlement'` and `splitType` becomes `SplitType | null` (null for settlements). `loadMoreTransactions` maps the new shape.
- `app/(dashboard)/dashboard/_components/CompactRow.tsx` — branches on `kind` to render either the transaction layout (existing) or the settlement layout (new: `↺` icon, "我還款" / "對方還款" text, no delta column).
- `app/(dashboard)/_components/TransactionFeed.tsx` — only calls `onItemClick` for `kind === 'transaction'` rows (settlements are read-only in 1c).
- `app/(dashboard)/dashboard/_components/BalanceHero.tsx` — replaces the disabled 結算 button with a clickable balance card that toggles inline `SettlementForm` expansion.
- `app/(dashboard)/dashboard/_components/Dashboard.tsx` — already passes `onMutated`; minor wiring to ensure settlement mutations also trigger refresh.

---

## Task 1: `createSettlement` + `softDeleteSettlement` server actions

**Files:**
- Create: `actions/settlement.ts`

- [ ] **Step 1: Create the file**

```ts
'use server'

import { db } from '@/lib/db/client'
import { settlements, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { eq, or, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface CreateSettlementInput {
  amount: number       // integer NTD, > 0
  payerId: string      // user.id paying down their debt (must be in group)
  settledAt: Date
  note?: string
}

export async function createSettlement(input: CreateSettlementInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error('金額必須是正整數')
  }

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
    const inserted = await tx
      .insert(settlements)
      .values({
        groupId: group.id,
        paidBy: input.payerId,
        amount: input.amount,
        note: input.note?.trim() || null,
        settledAt: input.settledAt,
      })
      .returning({ id: settlements.id })
    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}

export async function softDeleteSettlement(settlementId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(settlements)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(settlements.id, settlementId),
        eq(settlements.groupId, group.id),
        isNull(settlements.deletedAt),
      ))
      .returning({ id: settlements.id })
    if (updated.length === 0) throw new Error('找不到該筆紀錄')
    await recalcGroupBalance(group.id, tx)
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add actions/settlement.ts
git commit -m "feat(actions): createSettlement + softDeleteSettlement (atomic + recalc)"
```

---

## Task 2: UNION feed query + new row shape

`listTransactionsPaged` now returns BOTH transaction and settlement rows tagged with `kind`. `PagedTxnRow` gets a `kind` field and `splitType` becomes nullable. `loadMoreTransactions` maps the new shape.

**Files:**
- Modify: `lib/db/queries/transactions.ts`
- Modify: `actions/transaction.ts`

- [ ] **Step 1: Replace `listTransactionsPaged` in `lib/db/queries/transactions.ts`**

The current implementation uses Drizzle's query builder. The UNION version needs raw SQL because the two tables have mismatched column shapes (Settlements has no split_type / category). The cursor logic (composite `(transactedAt, createdAt) < cursor`) must apply to both branches.

Find the existing `listTransactionsPaged` function and the `TxnRowWithCreatedAt` interface, and replace with:

```ts
export type FeedKind = 'transaction' | 'settlement'

export interface FeedRow {
  id: string
  amount: number
  splitType: 'all_mine' | 'all_theirs' | 'half' | null  // null for settlements
  description: string
  category: string  // for settlements always 'settle'
  paidBy: string
  transactedAt: Date
  createdAt: Date
  kind: FeedKind
}

/**
 * Page through active transactions + settlements (newest first) using a composite
 * (transactedAt/settledAt, createdAt) cursor. Pass `cursor=null` for the first page.
 *
 * Settlements are normalized into the same row shape as transactions: settledAt → transactedAt,
 * COALESCE(note,'還款') → description, 'settle' → category, NULL → splitType.
 */
export async function listTransactionsPaged(
  groupId: string,
  cursor: TxnCursor | null,
  limit = 20,
): Promise<FeedRow[]> {
  // Cursor predicate, applied to both UNION branches.
  // For the transactions branch: (transacted_at, created_at) < cursor
  // For the settlements branch: (settled_at, created_at) < cursor
  const txCursor = cursor
    ? sql`AND (transacted_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``
  const setCursor = cursor
    ? sql`AND (settled_at, created_at) < (${cursor.transactedAt}::timestamptz, ${cursor.createdAt}::timestamptz)`
    : sql``

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
    transactedAt: r.transacted_at,
    createdAt: r.created_at,
    kind: r.kind,
  }))
}
```

Note: the old `TxnRowWithCreatedAt` interface is removed (replaced by `FeedRow`). The old `listRecentTransactions` function and its `TxnRow` interface are unaffected (Phase 1a code, still works for any internal consumer; nothing currently calls it after Phase 1b's TransactionFeed refactor — but leave it since deleting unused exports is risky).

- [ ] **Step 2: Update `actions/transaction.ts` — `PagedTxnRow` shape and `loadMoreTransactions` mapping**

Find the existing `PagedTxnRow` interface and replace:

```ts
export interface PagedTxnRow {
  id: string
  amount: number
  splitType: SplitType | null  // null for settlements
  description: string
  category: string
  paidBy: string
  transactedAt: string  // ISO
  createdAt: string     // ISO (used as cursor part)
  kind: 'transaction' | 'settlement'
}
```

Find the existing `loadMoreTransactions` function and update its mapping (add `kind` to the projection):

```ts
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
    kind: r.kind,
  }))
}
```

- [ ] **Step 3: Update `app/(dashboard)/dashboard/page.tsx` projection (add `kind`)**

Find the `recent` mapping in dashboard/page.tsx and add the `kind` field:

```ts
  const recent = rows.map((r) => ({
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
```

- [ ] **Step 4: Update `app/(dashboard)/records/page.tsx` projection (add `kind`)**

Same change in records/page.tsx — add `kind: r.kind` to the projection.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: pass. The build will fail if any consumer of `PagedTxnRow` (especially `CompactRow.tsx` via the `as CompactRowProps['tx']` cast) chokes on the new `kind` field. If so, the cast in `TransactionFeed` may need updating — handled in Task 4.

If the build fails on `splitType` becoming nullable in `CompactRow`, leave that for Task 3 (which explicitly updates CompactRow). For this task, you may need to temporarily widen `CompactRowProps['tx']['splitType']` to `'all_mine' | 'all_theirs' | 'half' | null` in `CompactRow.tsx` to keep the build green; Task 3 will properly use that nullability.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/transactions.ts actions/transaction.ts 'app/(dashboard)/dashboard/page.tsx' 'app/(dashboard)/records/page.tsx' 'app/(dashboard)/dashboard/_components/CompactRow.tsx'
git commit -m "feat(feed): UNION transactions + settlements with kind discriminator"
```

(Include `CompactRow.tsx` in the add only if you needed to widen its type to keep the build green.)

---

## Task 3: `CompactRow` settlement variant

CompactRow now branches on `kind`. Settlement variant: `↺` icon (from category 'settle'), description (e.g. "還款"), date · payer ("我還款" / "對方還款"), amount on the right, NO delta column (settlements don't change a per-row debt — they record a transfer).

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/CompactRow.tsx`

- [ ] **Step 1: Update `CompactRowProps` to include `kind`**

Find the existing interface and replace:

```ts
export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half' | null
    description: string
    category: string
    paidBy: string
    transactedAt: string
    kind: 'transaction' | 'settlement'
  }
  isLast: boolean
  onClick?: () => void
}
```

- [ ] **Step 2: Update the component to branch on `kind`**

Find the existing component body (the delta computation + JSX). Replace the entire function body with a kind-aware version. Keep the existing payer label / date format helpers intact:

```tsx
export function CompactRow({ tx, isLast, onClick }: CompactRowProps) {
  const { viewer, partner } = useMember()
  const payerIsViewer = tx.paidBy === viewer.id
  const payerInitial = payerIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const payerLabel = tx.kind === 'settlement'
    ? (payerIsViewer ? '我還款' : `${partner?.displayName ?? '對方'} 還款`)
    : (payerIsViewer ? '你付' : `${partner?.displayName ?? '對方'} 付`)

  // Delta is only meaningful for transactions. Settlements just transfer cash —
  // they don't change anyone's "share owed" for this individual row.
  let delta = 0
  if (tx.kind === 'transaction') {
    if (tx.splitType === 'all_theirs') {
      delta = payerIsViewer ? +tx.amount : -tx.amount
    } else if (tx.splitType === 'half') {
      delta = payerIsViewer ? +Math.ceil(tx.amount / 2) : -Math.ceil(tx.amount / 2)
    }
  }

  const dColor = delta > 0 ? 'var(--credit)' : delta < 0 ? 'var(--debit)' : 'var(--ink-3)'
  const showDelta = tx.kind === 'transaction'

  // M/D format
  const d = new Date(tx.transactedAt)
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`

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
        {showDelta && (
          <div className="tnum text-[10px] mt-px" style={{ color: dColor }}>
            {delta === 0 ? '—' : (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('en-US')}
          </div>
        )}
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
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/CompactRow.tsx'
git commit -m "feat(row): settlement variant — '我還款'/'對方還款' label, no delta"
```

---

## Task 4: `TransactionFeed` skips edit for settlement rows

Settlements are read-only in 1c. The feed must not pass `onClick` to settlement rows so taps don't open AddSheet (which would crash trying to prefill a settlement as a transaction).

**Files:**
- Modify: `app/(dashboard)/_components/TransactionFeed.tsx`

- [ ] **Step 1: Update the row mapping to gate `onClick`**

Find the existing `<CompactRow ... onClick={() => onItemClick(tx)} />` line. Replace with a kind-aware gate:

```tsx
              {g.items.map((tx, i) => (
                <CompactRow
                  key={tx.id}
                  tx={tx as CompactRowProps['tx']}
                  isLast={i === g.items.length - 1}
                  onClick={tx.kind === 'transaction' ? () => onItemClick(tx) : undefined}
                />
              ))}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/_components/TransactionFeed.tsx'
git commit -m "feat(feed): skip edit-on-tap for settlement rows"
```

---

## Task 5: `SettlementForm` component

Inline form rendered inside the BalanceHero card when settle is open. Uses `lib/settlement.ts` chip math and dispatches `createSettlement`. Viewer-flipped copy.

**Files:**
- Create: `app/(dashboard)/dashboard/_components/SettlementForm.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { createSettlement } from '@/actions/settlement'
import { settlementChips } from '@/lib/settlement'

interface Props {
  /** Absolute outstanding debt from VIEWER's perspective (always positive). */
  debtAmount: number
  /** True if viewer owes partner (viewer is debtor). False if viewer is owed. */
  viewerIsDebtor: boolean
  onClose: () => void
  onMutated: () => void
}

const TODAY_ISO = () => new Date().toISOString().slice(0, 10)

export function SettlementForm({ debtAmount, viewerIsDebtor, onClose, onMutated }: Props) {
  const { viewer, partner } = useMember()
  // Default to the full outstanding amount.
  const [amount, setAmount] = useState(String(debtAmount))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setAmount(String(debtAmount))
    setError('')
    const t = setTimeout(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    }, 250)
    return () => clearTimeout(t)
  }, [debtAmount])

  const chips = settlementChips(debtAmount)
  const parsed = parseInt(amount, 10) || 0

  const title = viewerIsDebtor
    ? '我還 多少？'
    : `${partner?.displayName ?? '對方'} 還了 多少？`
  const primaryText = viewerIsDebtor ? '記錄還款' : '記錄收款'

  const handleConfirm = () => {
    if (!parsed || parsed <= 0) { setError('請輸入金額'); return }
    if (parsed > debtAmount) { setError('金額不能超過欠款'); return }
    if (!viewerIsDebtor && !partner) { setError('伴侶尚未加入'); return }
    // Settlement payer = whoever owes (paying down their debt).
    const payerId = viewerIsDebtor ? viewer.id : partner!.id
    startTransition(async () => {
      try {
        await createSettlement({
          amount: parsed,
          payerId,
          settledAt: new Date(TODAY_ISO() + 'T00:00:00'),
        })
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  return (
    <div className="px-5 pt-2 pb-5">
      <div
        className="rounded-[18px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--ink-3)' }}>
          <Avatar
            who={viewerIsDebtor ? 'M' : 'T'}
            initial={viewerIsDebtor ? viewer.initial : (partner?.initial ?? '?')}
            size={20}
          />
          <span>{title}</span>
        </div>

        <label
          className="flex items-baseline justify-center gap-1.5 min-h-[56px] cursor-text"
          onClick={() => {
            const el = inputRef.current
            if (!el) return
            el.focus()
            el.select()
          }}
        >
          <span className="text-[18px] font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            value={amount}
            onChange={(e) => {
              const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
              setAmount(next)
            }}
            placeholder="0"
            aria-label="還款金額"
            className="tnum tracking-[-1.5px] leading-none bg-transparent border-0 outline-none text-center"
            style={{
              fontFamily: 'var(--font-numeric)',
              fontSize: 44,
              fontWeight: 600,
              color: amount ? 'var(--ink)' : 'var(--ink-3)',
              width: `${Math.max(amount.length || 1, 2)}ch`,
              caretColor: 'var(--accent)',
            }}
          />
        </label>

        {chips.length > 0 && (
          <div className="flex gap-2 justify-center mt-3 flex-wrap">
            {chips.map((c) => {
              const isActive = parsed === c.value
              return (
                <button
                  key={c.label}
                  onClick={() => setAmount(String(c.value))}
                  className="h-8 px-3 rounded-full text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    background: isActive ? 'var(--ink)' : 'var(--bg)',
                    color: isActive ? '#fff' : 'var(--ink-2)',
                    border: '1px solid var(--hairline)',
                  }}
                >
                  {c.label} · {c.value.toLocaleString('en-US')}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleConfirm}
            disabled={!parsed || pending}
            className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {pending ? '處理中…' : `${primaryText} NT$${parsed.toLocaleString('en-US')}`}
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

        {error && (
          <div className="mt-3 text-xs" style={{ color: 'var(--debit)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass (no consumer yet — Task 6 will wire it).

- [ ] **Step 3: Commit**

```bash
git add 'app/(dashboard)/dashboard/_components/SettlementForm.tsx'
git commit -m "feat(settlement): inline SettlementForm with chip math integration"
```

---

## Task 6: BalanceHero clickable + inline expansion

Replace the disabled 結算 button stub. Tap the balance card → expand SettlementForm. Re-tap or tap 取消 → collapse back.

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/BalanceHero.tsx`

- [ ] **Step 1: Update the BalanceHero file content**

Replace the entire content with:

```tsx
'use client'

import { useState } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { viewerBalance } from '@/lib/balance'
import { SettlementForm } from './SettlementForm'

interface Props {
  rawBalance: number  // member_a perspective (positive = b owes a)
  onAddClick: () => void
  /** Called after a successful settlement so the parent can router.refresh(). */
  onSettleMutated?: () => void
}

export function BalanceHero({ rawBalance, onAddClick, onSettleMutated }: Props) {
  const { viewer, partner, viewerIsA } = useMember()
  const balance = viewerBalance(rawBalance, viewerIsA)
  const [settleOpen, setSettleOpen] = useState(false)

  // balance > 0 → 對方 欠你; balance < 0 → 你 欠對方; balance == 0 → 打平
  let owedByWho: 'M' | 'T'
  let subjectName: string
  let verb: string
  if (balance > 0) {
    owedByWho = 'T'
    subjectName = partner?.displayName ?? '對方'
    verb = '欠你'
  } else if (balance < 0) {
    owedByWho = 'M'
    subjectName = '你'
    verb = '欠對方'
  } else {
    owedByWho = 'M'
    subjectName = '目前'
    verb = '打平'
  }

  const amount = Math.abs(balance)
  const showInitial = owedByWho === 'M' ? viewer.initial : (partner?.initial ?? '?')
  const canSettle = balance !== 0

  return (
    <div className="px-5 pt-6 pb-5">
      <button
        type="button"
        onClick={() => canSettle && setSettleOpen((v) => !v)}
        disabled={!canSettle}
        className="w-full text-left bg-transparent border-0 cursor-pointer disabled:cursor-default p-0"
        style={{ opacity: canSettle ? 1 : 1 }}
        aria-expanded={settleOpen}
        aria-label={canSettle ? '記錄還款 / 收款' : undefined}
      >
        <div className="flex items-start gap-[14px]">
          <Avatar who={owedByWho} initial={showInitial} size={44} />
          <div className="flex-1 pt-[2px] min-w-0">
            <div className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{subjectName}</span>{' '}
              <span>{verb}</span>
            </div>
            <div className="tnum leading-[1.05] tracking-[-1.4px]"
              style={{
                fontFamily: 'var(--font-numeric)',
                fontSize: 44,
                fontWeight: 600,
                color: 'var(--ink)',
              }}>
              <span className="text-[22px] font-medium mr-1" style={{ color: 'var(--ink-2)' }}>NT$</span>
              {amount.toLocaleString('en-US')}
            </div>
          </div>
          {canSettle && (
            <div
              className="self-center text-[22px] transition-transform duration-200"
              style={{
                color: 'var(--ink-3)',
                transform: settleOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              aria-hidden="true"
            >
              ⌄
            </div>
          )}
        </div>
      </button>

      {!settleOpen && (
        <div className="flex gap-2 mt-[18px]">
          <button onClick={onAddClick}
            className="flex-1 h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center gap-1.5"
            style={{ background: 'var(--ink)' }}>
            <PlusIcon size={16} />新增一筆
          </button>
        </div>
      )}

      {settleOpen && canSettle && (
        <SettlementForm
          debtAmount={amount}
          viewerIsDebtor={balance < 0}
          onClose={() => setSettleOpen(false)}
          onMutated={() => {
            onSettleMutated?.()
            setSettleOpen(false)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: pass. Note that BalanceHero's prop signature changed: removed `onSettleClick`, added optional `onSettleMutated`. Dashboard.tsx will need to pass the new prop in Task 7. The build may fail until Task 7 is also applied.

- [ ] **Step 3: Commit (defer until Task 7 since Dashboard is co-dependent)**

This commit lands together with Task 7. See Task 7 step 3.

---

## Task 7: Dashboard wires `onSettleMutated`

**Files:**
- Modify: `app/(dashboard)/dashboard/_components/Dashboard.tsx`

- [ ] **Step 1: Update the BalanceHero invocation**

Find the existing `<BalanceHero ... onSettleClick={() => { /* Phase 1c */ }} />` and replace with:

```tsx
      <BalanceHero
        rawBalance={balance}
        onAddClick={() => setAddOpen(true)}
        onSettleMutated={handleMutated}
      />
```

`handleMutated` already exists (defined as `() => router.refresh()`).

- [ ] **Step 2: Verify build + tests**

Run: `npm run build`
Expected: pass. The disabled-button-now-removed 結算 stub is gone; the balance card itself is the trigger.

Run: `npx vitest run`
Expected: all 43 tests pass (no test changes needed in this phase).

- [ ] **Step 3: Commit (covers Task 6 + 7)**

```bash
git add 'app/(dashboard)/dashboard/_components/BalanceHero.tsx' 'app/(dashboard)/dashboard/_components/Dashboard.tsx'
git commit -m "feat(balance): clickable card with inline SettlementForm expansion"
```

---

## Task 8: Final verification + manual E2E

**Files:** none (verification only).

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: all 43 tests pass (Phase 1c didn't add or modify tests; pure-function chip math was already covered in Phase 1a).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success. No new routes (settlement is inline in dashboard).

- [ ] **Step 4: Manual E2E**

Start: `npm run dev`

Settlement creation (you-owe direction):
```
□ Pre-condition: have at least one transaction where partner paid (so balance < 0 from your view, you owe partner)
□ /dashboard → balance card shows 「你 欠對方 NT$ X」
□ Tap balance card → card stays + ⌄ rotates 180°, 「+ 新增一筆」 button hides, SettlementForm appears below
□ Form title: 「我還 多少？」 with viewer avatar
□ Amount input prefilled with full debt, focused + selected
□ Quick chips visible: 「全額·X / 一半·X / 整數·X」 (the integer chip hides if it equals 全額 or if debt < 100)
□ Tap a chip → amount updates
□ Type a custom amount → primary button text updates: 「記錄還款 NT$X」
□ Try amount > debt → error 「金額不能超過欠款」
□ Try amount = 0 → error 「請輸入金額」
□ Confirm → form closes, balance updates (e.g. fully settled → 「目前 打平」), settlement row appears in list with ↺ icon
```

Settlement creation (you-are-owed direction):
```
□ Pre-condition: have at least one transaction where you paid (balance > 0 from your view)
□ Tap balance card → SettlementForm with title 「{partner name} 還了 多少？」
□ Primary button text: 「記錄收款 NT$X」
□ Confirm → settlement row appears showing 「{partner name} 還款」 description
```

Settlement display:
```
□ Settlement rows show ↺ icon (settle category)
□ Description reads 「還款」 (default note)
□ Subtitle reads 「{date} · {avatar} 我還款」 (or 「對方 還款」 if partner paid)
□ Right side shows just NT$ amount, NO delta line
□ Tapping a settlement row does NOTHING (read-only in 1c — opens no sheet)
```

Edge cases:
```
□ When balance == 0 → balance card not clickable (no ⌄ chevron, cursor stays default)
□ Multiple settlements + transactions interleaved by date — sort correctly in the feed
□ Pagination still works on /records when settlements present (load more spans both kinds)
□ Tap 取消 in SettlementForm → form closes, balance card reverts to display + add button
□ Tap balance card again to re-open → input is re-prefilled with current outstanding amount
```

Cross-page consistency:
```
□ Record a settlement from /dashboard → navigate to /records → see the settlement row (with ↺ icon)
□ Balance correctly reflects the settlement on both pages
```

- [ ] **Step 5: Final wrap-up commit (only if any small fixes were needed)**

If clean:

```bash
git commit --allow-empty -m "chore: phase 1c complete — settlement"
```

---

## Acceptance criteria (Phase 1c Done)

- [x] `createSettlement` server action atomic with balance recalc
- [x] `softDeleteSettlement` server action exists (no UI yet)
- [x] `listTransactionsPaged` UNIONs transactions + settlements with `kind` discriminator
- [x] CompactRow renders settlement variant: ↺ icon, 「我/對方 還款」 label, no delta column
- [x] Settlement rows are read-only (no tap-to-edit)
- [x] Balance card tappable → expands `SettlementForm` inline
- [x] Form title + primary-button text flip correctly based on viewer-is-debtor vs viewer-is-creditor
- [x] Quick chips (全額/一半/整數) populate the amount input on tap
- [x] Confirm settlement → balance updates, row appears in feed
- [x] Cancel collapses back to balance display
- [x] Build + typecheck pass; all 43 tests still pass

---

## Phase 1c → 1d handoff notes

Phase 1d will add:
- Filter bottom sheet on `/records` (誰付 / 分攤 / 分類, multi-select)
- Filter chip indicator on the 「篩選 >」 entry point
- Full settings page (group rename, member info, profile edit)
- Settlement edit / delete UI (tap settlement row → sheet with delete)
