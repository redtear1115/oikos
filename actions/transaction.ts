'use server'

import { db } from '@/lib/db/client'
import { cashTransactions, trips } from '@/lib/db/schema'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { validateTransactionInput, type RecordStatus } from '@/lib/validators'
import { listTransactionsPaged, listFeedAllPaged, listDescriptionSuggestions, type FeedRow, type TxnCursor, type ResolvedTxnFilter, type FeedKind } from '@/lib/db/queries/transactions'
import { listTransactionsPagedForAsset } from '@/lib/db/queries/asset'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { fromWire, type DateRange, type TxnFilterWire } from '@/lib/filter'
import { resolveTxnFilter } from '@/lib/resolveTxnFilter'
import { fromDrillWire, type DrillFilterWire } from '@/lib/drill'
import { eq, and, isNull } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { requireViewer } from '@/lib/auth/viewer'
import { assertMemberInGroup } from '@/lib/auth/member'
import { assertAssetInGroup } from '@/lib/auth/asset'
import { getViewerWriteContext } from '@/lib/actionContext'
import { revalidateAfterTransactionMutation } from '@/lib/revalidate'
import { convertAmount, type CurrencyCode } from '@/lib/currency'
import { listRatesForGroup } from '@/lib/db/queries/currencyRates'
import { captureServer, isUserFirstNonDeletedRecord } from '@/lib/analytics/server'

export interface CreateTransactionInput {
  amount: number              // integer NTD, > 0
  description: string         // required, non-empty after trim
  category: CategoryId | string  // 'other' fallback if invalid
  splitType: SplitType
  payerId: string             // user.id of payer (must be in group)
  /** Calendar date 'YYYY-MM-DD'. Validator anchors at UTC noon (#453). */
  transactedAt: string
  assetId?: string | null
  notes?: string | null
  splitRatioA?: number | null
  status?: RecordStatus       // defaults to 'settled' (issue #49)
  /** Foreign currency for this transaction. Defaults to group.baseCurrency. */
  currency?: CurrencyCode
  /** Trip to tag this transaction under. NULL = no trip. */
  tripId?: string | null
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<{ id: string; isFirstTransaction: boolean }> {
  const { user, group } = await getViewerWriteContext()

  const validated = validateTransactionInput({
    ...input,
    splitRatioA: input.splitRatioA ?? null,
  })

  // Payer must be in group
  assertMemberInGroup(input.payerId, group, '付款人不在家計簿內')

  // Asset ownership + not-deleted check (only if assetId provided)
  if (validated.assetId) {
    await assertAssetInGroup(validated.assetId, group.id)
  }

  // Multi-currency conversion (#68). When currency matches base, no conversion
  // needed and the three snapshot fields stay NULL.
  const inputCurrency = (input.currency ?? group.baseCurrency) as CurrencyCode
  let baseAmount = validated.amount
  let originalCurrency: CurrencyCode | null = null
  let originalAmount: number | null = null
  let rateSnapshot: string | null = null

  if (inputCurrency !== group.baseCurrency) {
    const rates = await listRatesForGroup(group.id)
    const rate = rates.find(
      (r) => r.fromCurrency === inputCurrency && r.toCurrency === group.baseCurrency,
    )
    if (!rate) {
      throw new Error(`未設定 ${inputCurrency.toUpperCase()} → ${group.baseCurrency.toUpperCase()} 匯率`)
    }
    baseAmount = convertAmount({
      amount: validated.amount,
      from: inputCurrency,
      to: group.baseCurrency as CurrencyCode,
      rate: parseFloat(rate.rate),
    })
    originalCurrency = inputCurrency
    originalAmount = validated.amount
    rateSnapshot = rate.rate
  }

  // Trip ownership check (#42)
  if (input.tripId) {
    const [t] = await db
      .select({ id: trips.id, groupId: trips.groupId })
      .from(trips)
      .where(eq(trips.id, input.tripId))
      .limit(1)
    if (!t || t.groupId !== group.id) throw new Error('旅行不存在')
  }

  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(cashTransactions)
      .values({
        groupId: group.id,
        paidBy: validated.payerId,
        amount: baseAmount,
        splitType: validated.splitType,
        description: validated.description,
        category: validated.category,
        notes: validated.notes,
        status: validated.status,
        transactedAt: validated.transactedAt,
        assetId: validated.assetId,
        splitRatioA: validated.splitRatioA,
        originalCurrency,
        originalAmount,
        rateSnapshot,
        tripId: input.tripId ?? null,
      })
      .returning({ id: cashTransactions.id })
    await recalcGroupBalance(group.id, tx)

    // Per-user "first record" signal for the #43 phase C card. See
    // isUserFirstNonDeletedRecord docstring for the partner-as-payer caveat.
    const isFirstTransaction = await isUserFirstNonDeletedRecord(tx, user.id, group.id)

    return { id: inserted.id, isFirstTransaction }
  })

  revalidateAfterTransactionMutation({ assetId: validated.assetId })

  // Activation signal (#734): the user's first manual record.
  if (result.isFirstTransaction) {
    await captureServer(user.id, 'first_record_created', { via: 'manual' })
  }

  // Daily-active signal (#811): every new record, regardless of whether it's
  // the first. This is the true DAU denominator for a ledger PWA.
  await captureServer(user.id, 'record_created', {
    split_type: validated.splitType,
    category: validated.category,
    has_asset: !!validated.assetId,
    has_trip: !!(input.tripId),
    currency: inputCurrency,
    via: 'manual',
  })

  return result
}

export async function softDeleteTransaction(transactionId: string): Promise<void> {
  const { group } = await getViewerWriteContext()

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

  revalidateAfterTransactionMutation()
}

export interface EditTransactionInput {
  oldId: string
  amount: number
  description: string
  category: CategoryId | string
  splitType: SplitType
  payerId: string
  /** Calendar date 'YYYY-MM-DD'. Validator anchors at UTC noon (#453). */
  transactedAt: string
  assetId?: string | null
  notes?: string | null
  splitRatioA?: number | null
  status?: RecordStatus
  /** Foreign currency for the edited transaction. Defaults to group.baseCurrency. */
  currency?: CurrencyCode
  /** Trip to tag this transaction under. NULL = no trip. */
  tripId?: string | null
}

export async function editTransaction(input: EditTransactionInput): Promise<{ id: string }> {
  const { group } = await getViewerWriteContext()

  const validated = validateTransactionInput({
    ...input,
    splitRatioA: input.splitRatioA ?? null,
  })

  assertMemberInGroup(input.payerId, group, '付款人不在家計簿內')

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
    await assertAssetInGroup(validated.assetId, group.id)
  }

  // Multi-currency conversion for the edited row (#68)
  const editInputCurrency = (input.currency ?? group.baseCurrency) as CurrencyCode
  let editBaseAmount = validated.amount
  let editOriginalCurrency: CurrencyCode | null = null
  let editOriginalAmount: number | null = null
  let editRateSnapshot: string | null = null

  if (editInputCurrency !== group.baseCurrency) {
    const rates = await listRatesForGroup(group.id)
    const rate = rates.find(
      (r) => r.fromCurrency === editInputCurrency && r.toCurrency === group.baseCurrency,
    )
    if (!rate) {
      throw new Error(`未設定 ${editInputCurrency.toUpperCase()} → ${group.baseCurrency.toUpperCase()} 匯率`)
    }
    editBaseAmount = convertAmount({
      amount: validated.amount,
      from: editInputCurrency,
      to: group.baseCurrency as CurrencyCode,
      rate: parseFloat(rate.rate),
    })
    editOriginalCurrency = editInputCurrency
    editOriginalAmount = validated.amount
    editRateSnapshot = rate.rate
  }

  // Trip ownership check for edit (#42)
  if (input.tripId) {
    const [t] = await db
      .select({ id: trips.id, groupId: trips.groupId })
      .from(trips)
      .where(eq(trips.id, input.tripId))
      .limit(1)
    if (!t || t.groupId !== group.id) throw new Error('旅行不存在')
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
        amount: editBaseAmount,
        splitType: validated.splitType,
        description: validated.description,
        category: validated.category,
        notes: validated.notes,
        status: validated.status,
        transactedAt: validated.transactedAt,
        assetId: validated.assetId,
        splitRatioA: validated.splitRatioA,
        originalCurrency: editOriginalCurrency,
        originalAmount: editOriginalAmount,
        rateSnapshot: editRateSnapshot,
        tripId: input.tripId ?? null,
      })
      .returning({ id: cashTransactions.id })

    await recalcGroupBalance(group.id, tx)
    return inserted
  })

  revalidateAfterTransactionMutation({
    assetId: validated.assetId,
    previousAssetId: oldRow.assetId,
  })

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
  /** Original currency when foreign-currency write. NULL for base-currency rows. */
  originalCurrency: string | null
  /** Original amount in the foreign currency's storage units. NULL for base-currency rows. */
  originalAmount: number | null
  /** Rate snapshot at write time. NULL for base-currency rows. */
  rateSnapshot: string | null
  /** Trip this transaction belongs to. NULL = no trip. */
  tripId: string | null
}

/**
 * Wire → ResolvedTxnFilter for the Records feed pagination loaders. Decodes the
 * wire shape and defers the 誰付→uuid collapse + cross-kind cut rules to the
 * shared `resolveTxnFilter` so the page-through stays identical to the SSR feed
 * resolved in `app/(dashboard)/records/page.tsx`. Returns `undefined` for an
 * absent filter (the queries then skip the filter entirely).
 */
function resolveWireFilter(
  filterWire: TxnFilterWire | undefined,
  viewerId: string,
  group: { memberA: string; memberB: string | null },
): ResolvedTxnFilter | undefined {
  if (!filterWire) return undefined
  return resolveTxnFilter(fromWire(filterWire), viewerId, group)
}

export async function loadMoreTransactions(
  cursor: TxnCursor | null,
  limit = 20,
  filterWire?: TxnFilterWire,
  monthKey?: string,
  drillWire?: DrillFilterWire,
  dateRange?: DateRange,
): Promise<PagedTxnRow[]> {
  const { user } = await requireViewer()

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  const { group, window: epochWindow } = context

  const resolved = resolveWireFilter(filterWire, user.id, group)
  const drill = drillWire ? fromDrillWire(drillWire) : undefined
  const rows = await listTransactionsPaged({
    groupId: group.id,
    cursor,
    limit,
    filter: resolved,
    monthKey,
    drill,
    dateRange,
    epochWindow,
  })
  return rows.map(toPagedTxnRow)
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
  const { user } = await requireViewer()

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  const { group, window: epochWindow } = context

  const resolved = resolveWireFilter(filterWire, user.id, group)
  const drill = drillWire ? fromDrillWire(drillWire) : undefined
  const rows = await listFeedAllPaged({
    groupId: group.id,
    cursor,
    limit,
    filter: resolved,
    monthKey,
    drill,
    dateRange,
    epochWindow,
  })
  return rows.map(toPagedTxnRow)
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
  const { user } = await requireViewer()

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  const { group, window: epochWindow } = context

  const rows = await listTransactionsPagedForAsset(assetId, group.id, cursor, limit, epochWindow)
  return rows.map(toPagedTxnRow)
}

/**
 * Serialize a query-layer FeedRow into the wire-shape PagedTxnRow returned by
 * the loadMore* server actions. Three sites previously inlined this mapping;
 * collapsing them keeps the wire contract (ISO timestamps, null-coalescing,
 * 'settled' default for legacy rows) in one place.
 */
function toPagedTxnRow(r: FeedRow): PagedTxnRow {
  return {
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
    originalCurrency: r.originalCurrency ?? null,
    originalAmount: r.originalAmount ?? null,
    rateSnapshot: r.rateSnapshot ?? null,
    tripId: r.tripId ?? null,
  }
}

/**
 * Return unique CashTransaction descriptions for the viewer's group, ordered
 * by frequency (most-used first). Powers the description-field autocomplete in
 * AddSheet — re-fetched whenever the sheet opens so newly-added descriptions
 * surface immediately on the next entry.
 */
export async function getDescriptionSuggestions(): Promise<string[]> {
  const { user } = await requireViewer()

  // Empty list (not a throw) when there's no group yet — autocomplete is
  // a UX nicety, not an integrity check.
  const group = await getActiveGroupForUser(user.id)
  if (!group) return []

  return listDescriptionSuggestions(group.id)
}
