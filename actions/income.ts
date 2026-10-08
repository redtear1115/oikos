'use server'

import { db } from '@/lib/db/client'
import { assets, incomeTransactions } from '@/lib/db/schema'
import { validateIncomeInput, type IncomeInput } from '@/lib/validators'
import { listIncomesPaged, type IncomeCursor } from '@/lib/db/queries/incomes'
import { lockOpenChapterForWrite, resolveViewedPair, resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { openChapterCreatedClause } from '@/lib/db/queries/_predicates'
import { listInsuranceReturnsPaged } from '@/lib/db/queries/insurance'
import { fromDrillWire, type DrillFilterWire } from '@/lib/drill'
import { fromWire, type DateRange, type TxnFilterWire } from '@/lib/filter'
import { resolveIncomeFilter } from '@/lib/resolveTxnFilter'
import { and, eq, isNull } from 'drizzle-orm'
import { requireViewer, requireViewerGroup } from '@/lib/auth/viewer'
import { assertMemberInGroup } from '@/lib/auth/member'
import { assertAssetInGroup } from '@/lib/auth/asset'
import { getViewerWriteContext } from '@/lib/actionContext'
import { revalidateAfterIncomeMutation } from '@/lib/revalidate'
import { captureServer } from '@/lib/analytics/server'
import { action, actionError } from '@/lib/action-errors'

export type CreateIncomeInput = IncomeInput

export interface EditIncomeInput extends IncomeInput {
  oldId: string
}

/** Read-path variant that follows the past-epoch pin (possibly cross-group,
 *  see #141) so paged feeds match what the dashboard / records pages render. */
async function getViewerReadContext() {
  const { user } = await requireViewer()

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw actionError('group_not_found')

  return { user, group: context.group, epochWindow: context.window, context }
}

export const createIncome = action(async (input: CreateIncomeInput): Promise<{ id: string }> => {
  const { user, group } = await getViewerWriteContext()
  const validated = validateIncomeInput(input)
  assertMemberInGroup(validated.recipientId, group, 'recipient_not_in_group')
  if (validated.assetId) await assertAssetInGroup(validated.assetId, group.id)

  const [created] = await db
    .insert(incomeTransactions)
    .values({
      groupId: group.id,
      recipientId: validated.recipientId,
      amount: validated.amount,
      category: validated.category,
      source: validated.source,
      assetId: validated.assetId,
      occurredAt: validated.occurredAt,
    })
    .returning({ id: incomeTransactions.id })

  revalidateAfterIncomeMutation()

  // Income tracking (#813).
  await captureServer(user.id, 'income_created', {
    category: validated.category,
    has_asset: !!validated.assetId,
  })

  return { id: created.id }
})

export const editIncome = action(async (input: EditIncomeInput): Promise<{ id: string }> => {
  const { group } = await getViewerWriteContext()
  const validated = validateIncomeInput(input)
  assertMemberInGroup(validated.recipientId, group, 'recipient_not_in_group')
  if (validated.assetId) await assertAssetInGroup(validated.assetId, group.id)

  // Chapter lock first, recipient re-checked against the members read under
  // it, and only a row of the open chapter (see editTransaction).
  const [created] = await db.transaction(async (tx) => {
    const lock = await lockOpenChapterForWrite(tx, group.id)
    if (!lock) throw actionError('income_not_found')
    assertMemberInGroup(validated.recipientId, lock.group, 'recipient_not_in_group')

    const deleted = await tx
      .update(incomeTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(incomeTransactions.id, input.oldId),
        eq(incomeTransactions.groupId, group.id),
        isNull(incomeTransactions.deletedAt),
        openChapterCreatedClause('"IncomeTransactions"."created_at"', group.id),
      ))
      .returning({ id: incomeTransactions.id })
    if (deleted.length === 0) throw actionError('income_not_found')

    return await tx
      .insert(incomeTransactions)
      .values({
        groupId: group.id,
        recipientId: validated.recipientId,
        amount: validated.amount,
        category: validated.category,
        source: validated.source,
        assetId: validated.assetId,
        occurredAt: validated.occurredAt,
      })
      .returning({ id: incomeTransactions.id })
  })

  revalidateAfterIncomeMutation()
  return { id: created.id }
})

export const softDeleteIncome = action(async (id: string): Promise<void> => {
  const { group } = await getViewerWriteContext()

  // One guarded UPDATE: the existence, group and chapter checks are the
  // UPDATE's own WHERE, so nothing can change between a check and the write.
  await db.transaction(async (tx) => {
    if (!await lockOpenChapterForWrite(tx, group.id)) throw actionError('income_not_found')
    const deleted = await tx
      .update(incomeTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(incomeTransactions.id, id),
        eq(incomeTransactions.groupId, group.id),
        isNull(incomeTransactions.deletedAt),
        openChapterCreatedClause('"IncomeTransactions"."created_at"', group.id),
      ))
      .returning({ id: incomeTransactions.id })
    if (deleted.length === 0) throw actionError('income_not_found')
  })

  revalidateAfterIncomeMutation()
})

export interface PagedIncomeRow {
  id: string
  amount: number
  category: string
  source: string | null
  recipientId: string
  assetId: string | null
  occurredAt: string  // ISO date
  createdAt: string   // ISO timestamp
  kind: 'income'
}

// Insurance dropdown options for IncomeSheet + recurring-income setup.
// Uses ACTIVE group (not pin-aware) so the dropdown stays consistent with the
// recurring rules path, which always writes to the viewer's active group via
// lib/recurringActionHelpers.ts. Past-epoch viewers can still navigate here
// to set up future rules; the data they see should match where rules write.
export const getInsuranceAssets = action(async (): Promise<{ id: string; name: string }[]> => {
  const { group } = await requireViewerGroup()
  const rows = await db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .where(and(
      eq(assets.groupId, group.id),
      eq(assets.type, 'insurance'),
      isNull(assets.deletedAt),
      isNull(assets.frozenAt),  // #1442 — never offer a frozen copy
    ))
  return rows
})

export const loadMoreIncomes = action(async (
  cursor: IncomeCursor | null,
  limit: number = 20,
  monthKey?: string,
  drillWire?: DrillFilterWire,
  filterWire?: TxnFilterWire,
  dateRange?: DateRange,
): Promise<PagedIncomeRow[]> => {
  const { user, group, epochWindow, context } = await getViewerReadContext()
  const drill = drillWire ? fromDrillWire(drillWire) : undefined
  // #1604 — 「對方」 is the viewed chapter's partner, as on first render.
  const incomeFilter = filterWire
    ? resolveIncomeFilter(fromWire(filterWire), user.id, await resolveViewedPair(context, user.id))
    : undefined
  const rows = await listIncomesPaged(group.id, cursor, limit, monthKey, drill, incomeFilter, dateRange, epochWindow)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    category: r.category,
    source: r.source,
    recipientId: r.recipientId,
    assetId: r.assetId,
    occurredAt: r.occurredAt,
    createdAt: r.createdAt.toISOString(),
    kind: 'income' as const,
  }))
})

export const loadMoreInsuranceReturns = action(async (
  assetId: string,
  categories: string[],
  cursor: IncomeCursor | null,
  limit: number = 20,
): Promise<PagedIncomeRow[]> => {
  const { group, epochWindow } = await getViewerReadContext()
  const rows = await listInsuranceReturnsPaged(assetId, group.id, categories, cursor, limit, epochWindow)
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    category: r.category,
    source: r.source,
    recipientId: r.recipientId,
    assetId: r.assetId,
    occurredAt: r.occurredAt,
    createdAt: r.createdAt.toISOString(),
    kind: 'income' as const,
  }))
})
