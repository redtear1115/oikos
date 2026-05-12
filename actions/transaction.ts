'use server'

import { db } from '@/lib/db/client'
import { assets, cashTransactions, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { validateTransactionInput, type RecordStatus } from '@/lib/validators'
import { listTransactionsPaged, listFeedAllPaged, listDescriptionSuggestions, type TxnCursor, type ResolvedTxnFilter, type FeedKind } from '@/lib/db/queries/transactions'
import { listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { cutsExpense, fromWire, hidesSettlements, type DateRange, type TxnFilterWire } from '@/lib/filter'
import { fromDrillWire, type DrillFilterWire } from '@/lib/drill'
import { eq, or, and, isNull, sql } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { revalidatePath } from 'next/cache'

export interface CreateTransactionInput {
  amount: number              // integer NTD, > 0
  description: string         // required, non-empty after trim
  category: CategoryId | string  // 'other' fallback if invalid
  splitType: SplitType
  payerId: string             // user.id of payer (must be in group)
  transactedAt: Date
  assetId?: string | null
  notes?: string | null
  splitRatioA?: number | null
  status?: RecordStatus       // defaults to 'settled' (issue #49)
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<{ id: string; isFirstTransaction: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Validate
  const validated = validateTransactionInput({
    ...input,
    splitRatioA: input.splitRatioA ?? null,
  })

  // Find viewer's group
  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('找不到家計簿')

  // Payer must be in group
  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  // Asset ownership + not-deleted check (only if assetId provided)
  if (validated.assetId) {
    const [asset] = await db
      .select({ id: assets.id, deletedAt: assets.deletedAt })
      .from(assets)
      .where(and(
        eq(assets.id, validated.assetId),
        eq(assets.groupId, group.id),
      ))
      .limit(1)
    if (!asset) throw new Error('關聯資產不在家計簿內')
    if (asset.deletedAt) throw new Error('關聯資產已刪除')
  }

  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: validated.amount,
        splitType: validated.splitType,
        description: validated.description,
        category: validated.category,
        notes: validated.notes,
        status: validated.status,
        transactedAt: validated.transactedAt,
        assetId: validated.assetId,
        splitRatioA: validated.splitRatioA,
      })
      .returning({ id: cashTransactions.id })
    await recalcGroupBalance(group.id, tx)

    // Per-user "first record" signal for the #43 phase C card. paid_by is the
    // proxy for "who entered this row" — there is no created_by column. The
    // typical first-record moment is the user logging their own purchase, so
    // the proxy holds; an edge case where the user marks the partner as payer
    // first won't fire the card.
    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(cashTransactions)
      .where(and(
        eq(cashTransactions.groupId, group.id),
        eq(cashTransactions.paidBy, user.id),
        isNull(cashTransactions.deletedAt),
      ))
    const isFirstTransaction = (countRow?.count ?? 0) === 1

    return { id: inserted.id, isFirstTransaction }
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (validated.assetId) revalidatePath(`/assets/${validated.assetId}`)
  return result
}

export async function softDeleteTransaction(transactionId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('找不到家計簿')

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(cashTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(cashTransactions.id, transactionId),
        eq(cashTransactions.groupId, group.id),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })
    if (updated.length === 0) throw new Error('找不到該筆紀錄')
    await recalcGroupBalance(group.id, tx)
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
}

export interface EditTransactionInput {
  oldId: string
  amount: number
  description: string
  category: CategoryId | string
  splitType: SplitType
  payerId: string
  transactedAt: Date
  assetId?: string | null
  notes?: string | null
  splitRatioA?: number | null
  status?: RecordStatus
}

export async function editTransaction(input: EditTransactionInput): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const validated = validateTransactionInput({
    ...input,
    splitRatioA: input.splitRatioA ?? null,
  })

  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('找不到家計簿')

  if (input.payerId !== group.memberA && input.payerId !== group.memberB) {
    throw new Error('付款人不在家計簿內')
  }

  // 1. Look up old row to (a) prove existence, (b) get its assetId for the
  //    "kept zombie" exemption check.
  const [oldRow] = await db
    .select({ assetId: cashTransactions.assetId })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.id, input.oldId),
      eq(cashTransactions.groupId, group.id),
      isNull(cashTransactions.deletedAt),
    ))
    .limit(1)
  if (!oldRow) throw new Error('找不到該筆紀錄')

  // 2. Asset check — only when newly assigning (or changing) to a different asset.
  if (validated.assetId && validated.assetId !== oldRow.assetId) {
    const [asset] = await db
      .select({ id: assets.id, deletedAt: assets.deletedAt })
      .from(assets)
      .where(and(
        eq(assets.id, validated.assetId),
        eq(assets.groupId, group.id),
      ))
      .limit(1)
    if (!asset) throw new Error('關聯資產不在家計簿內')
    if (asset.deletedAt) throw new Error('關聯資產已刪除')
  }

  // 3. Soft-delete old + insert new in one tx. Keep .returning() on the soft-delete
  //    as a race guard: if a partner soft-deleted the row between step 1 and now,
  //    the WHERE's isNull(deletedAt) makes the UPDATE no-op, and we'd silently
  //    create a dup. The length check restores the existence proof inside the tx.
  const [created] = await db.transaction(async (tx) => {
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

    const inserted = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: validated.amount,
        splitType: validated.splitType,
        description: validated.description,
        category: validated.category,
        notes: validated.notes,
        status: validated.status,
        transactedAt: validated.transactedAt,
        assetId: validated.assetId,
        splitRatioA: validated.splitRatioA,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (oldRow.assetId) revalidatePath(`/assets/${oldRow.assetId}`)
  if (validated.assetId) revalidatePath(`/assets/${validated.assetId}`)

  return { id: created.id }
}

export interface PagedTxnRow {
  id: string
  amount: number
  splitType: SplitType | null  // null for settlements
  description: string
  category: string
  paidBy: string
  transactedAt: string  // ISO
  createdAt: string     // ISO (used as cursor part)
  kind: FeedKind
  assetId: string | null
  fuelLogId: string | null  // non-null when row was created by a FuelLog dual-write
  notes: string | null  // shared memo on a CashTransaction; null for settlements/income/empty
  splitRatioA: number | null
  status: RecordStatus  // settlements/income are always 'settled'; only CashTransactions can be 'pending'
}

/**
 * Wire → ResolvedTxnFilter conversion. The 誰付 dimension is collapsed to a
 * concrete user id ('mine' → viewer, 'theirs' → partner or an impossible UUID
 * when no partner so the SQL just returns 0 rows). Used by the Records feed
 * actions; the in-memory `matchesFilter` (used for realtime echo / SSR-row
 * filtering) takes the unresolved TxnFilter and does the same resolution
 * client-side against viewer/partner ids.
 */
function resolveTxnFilter(
  filterWire: TxnFilterWire | undefined,
  viewerId: string,
  group: { memberA: string; memberB: string | null },
): ResolvedTxnFilter | undefined {
  if (!filterWire) return undefined
  const f = fromWire(filterWire)
  let paidBy: string | null = null
  if (f.payer === 'mine') paidBy = viewerId
  else if (f.payer === 'theirs') {
    const partner = group.memberA === viewerId ? group.memberB : group.memberA
    paidBy = partner ?? '00000000-0000-0000-0000-000000000000'
  }
  return {
    paidBy,
    splitTypes: f.split === 'all' ? [] : [f.split],
    categories: Array.from(f.categories),
    incomeCategories: Array.from(f.incomeCategories),
    assetIds: Array.from(f.assetIds),
    amountMin: f.amountMin,
    amountMax: f.amountMax,
    status: f.status === 'all' ? null : f.status,
    excludeSettlements: hidesSettlements(f),
    cutAll: cutsExpense(f),
  }
}

export async function loadMoreTransactions(
  cursor: TxnCursor | null,
  limit = 20,
  filterWire?: TxnFilterWire,
  monthKey?: string,
  drillWire?: DrillFilterWire,
  dateRange?: DateRange,
): Promise<PagedTxnRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  const { group, window: epochWindow } = context

  const resolved = resolveTxnFilter(filterWire, user.id, group)
  const drill = drillWire ? fromDrillWire(drillWire) : undefined
  const rows = await listTransactionsPaged(group.id, cursor, limit, resolved, monthKey, drill, dateRange, epochWindow)
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
    assetId: r.assetId,
    fuelLogId: r.fuelLogId ?? null,
    notes: r.notes ?? null,
    splitRatioA: r.splitRatioA ?? null,
    status: r.status ?? 'settled',
  }))
}

/**
 * Records "全部" tab feed: UNION CashTransactions + Settlements + IncomeTransactions,
 * newest first.
 */
export async function loadMoreFeedAll(
  cursor: TxnCursor | null,
  limit = 20,
  monthKey?: string,
  drillWire?: DrillFilterWire,
  filterWire?: TxnFilterWire,
  dateRange?: DateRange,
): Promise<PagedTxnRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  const { group, window: epochWindow } = context

  const resolved = resolveTxnFilter(filterWire, user.id, group)
  const drill = drillWire ? fromDrillWire(drillWire) : undefined
  const rows = await listFeedAllPaged(group.id, cursor, limit, monthKey, drill, resolved, dateRange, epochWindow)
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
    assetId: r.assetId,
    fuelLogId: r.fuelLogId ?? null,
    notes: r.notes ?? null,
    splitRatioA: r.splitRatioA ?? null,
    status: r.status ?? 'settled',
  }))
}

/**
 * Asset-scoped page-through (newest first). Settlements never have an asset,
 * so this is transactions-only.
 */
export async function loadMoreTransactionsForAsset(
  assetId: string,
  cursor: TxnCursor | null,
  limit = 20,
): Promise<PagedTxnRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  const { group, window: epochWindow } = context

  const rows = await listTransactionsPagedForAsset(assetId, group.id, cursor, limit, epochWindow)
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
    assetId: r.assetId ?? null,
    fuelLogId: r.fuelLogId ?? null,
    notes: r.notes ?? null,
    splitRatioA: r.splitRatioA ?? null,
    status: r.status ?? 'settled',
  }))
}

/**
 * Return unique CashTransaction descriptions for the viewer's group, ordered
 * by frequency (most-used first). Powers the description-field autocomplete in
 * AddSheet — re-fetched whenever the sheet opens so newly-added descriptions
 * surface immediately on the next entry.
 */
export async function getDescriptionSuggestions(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const group = await getActiveGroupForUser(user.id)
  if (!group) return []

  return listDescriptionSuggestions(group.id)
}
