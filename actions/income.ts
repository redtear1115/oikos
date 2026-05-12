'use server'

import { db } from '@/lib/db/client'
import { assets, incomeTransactions, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validateIncomeInput, type IncomeInput } from '@/lib/validators'
import { listIncomesPaged, type IncomeCursor, type ResolvedIncomeFilter } from '@/lib/db/queries/incomes'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { listInsuranceReturnsPaged } from '@/lib/db/queries/insurance'
import { fromDrillWire, type DrillFilterWire } from '@/lib/drill'
import { cutsIncome, fromWire, type DateRange, type TxnFilterWire } from '@/lib/filter'
import { and, eq, isNull, or } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { revalidatePath } from 'next/cache'

export type CreateIncomeInput = IncomeInput

export interface EditIncomeInput extends IncomeInput {
  oldId: string
}

async function getViewerGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('找不到家計簿')

  return { user, group }
}

/** Read-path variant that follows the past-epoch pin (possibly cross-group,
 *  see #141) so paged feeds match what the dashboard / records pages render. */
async function getViewerReadContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')

  return { user, group: context.group, epochWindow: context.window }
}

async function assertAssetInGroup(assetId: string, groupId: string) {
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.groupId, groupId)))
    .limit(1)
  if (!asset) throw new Error('關聯愛物不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯愛物已刪除')
}

function assertRecipientInGroup(
  recipientId: string,
  group: { memberA: string; memberB: string | null },
) {
  if (recipientId !== group.memberA && recipientId !== group.memberB) {
    throw new Error('收入歸屬不在家計簿內')
  }
}

export async function createIncome(input: CreateIncomeInput): Promise<{ id: string }> {
  const validated = validateIncomeInput(input)
  const { group } = await getViewerGroup()
  assertRecipientInGroup(validated.recipientId, group)
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

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}

export async function editIncome(input: EditIncomeInput): Promise<{ id: string }> {
  const validated = validateIncomeInput(input)
  const { group } = await getViewerGroup()
  assertRecipientInGroup(validated.recipientId, group)
  if (validated.assetId) await assertAssetInGroup(validated.assetId, group.id)

  const [created] = await db.transaction(async (tx) => {
    const deleted = await tx
      .update(incomeTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(incomeTransactions.id, input.oldId),
        eq(incomeTransactions.groupId, group.id),
        isNull(incomeTransactions.deletedAt),
      ))
      .returning({ id: incomeTransactions.id })
    if (deleted.length === 0) throw new Error('找不到該筆收入')

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

  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}

export async function softDeleteIncome(id: string): Promise<void> {
  const { group } = await getViewerGroup()

  const [row] = await db
    .select({ id: incomeTransactions.id })
    .from(incomeTransactions)
    .where(and(
      eq(incomeTransactions.id, id),
      eq(incomeTransactions.groupId, group.id),
      isNull(incomeTransactions.deletedAt),
    ))
    .limit(1)
  if (!row) throw new Error('找不到該筆收入')

  await db
    .update(incomeTransactions)
    .set({ deletedAt: new Date() })
    .where(eq(incomeTransactions.id, id))

  revalidatePath('/dashboard')
  revalidatePath('/records')
}

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

export async function getInsuranceAssets(): Promise<{ id: string; name: string }[]> {
  const { group } = await getViewerGroup()
  const rows = await db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .where(and(
      eq(assets.groupId, group.id),
      eq(assets.type, 'insurance'),
      isNull(assets.deletedAt),
    ))
  return rows
}

/**
 * Wire → ResolvedIncomeFilter conversion. Income rows have no split / no
 * expense-categories: if either of those dims is active in the filter, the
 * entire result set is dropped (cutAll = true) rather than silently ignoring
 * the filter. Payer ('mine' / 'theirs') maps to recipient_id; assetIds pass
 * through verbatim (the SQL helper expands the '__none__' sentinel).
 */
function resolveIncomeFilter(
  filterWire: TxnFilterWire | undefined,
  viewerId: string,
  group: { memberA: string; memberB: string | null },
): ResolvedIncomeFilter | undefined {
  if (!filterWire) return undefined
  const f = fromWire(filterWire)
  let recipientId: string | null = null
  if (f.payer === 'mine') recipientId = viewerId
  else if (f.payer === 'theirs') {
    const partner = group.memberA === viewerId ? group.memberB : group.memberA
    recipientId = partner ?? '00000000-0000-0000-0000-000000000000'
  }
  return {
    recipientId,
    assetIds: Array.from(f.assetIds),
    incomeCategories: Array.from(f.incomeCategories),
    amountMin: f.amountMin,
    amountMax: f.amountMax,
    cutAll: cutsIncome(f),
  }
}

export async function loadMoreIncomes(
  cursor: IncomeCursor | null,
  limit = 20,
  monthKey?: string,
  drillWire?: DrillFilterWire,
  filterWire?: TxnFilterWire,
  dateRange?: DateRange,
): Promise<PagedIncomeRow[]> {
  const { user, group, epochWindow } = await getViewerReadContext()
  const drill = drillWire ? fromDrillWire(drillWire) : undefined
  const incomeFilter = resolveIncomeFilter(filterWire, user.id, group)
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
}

export async function loadMoreInsuranceReturns(
  assetId: string,
  categories: string[],
  cursor: IncomeCursor | null,
  limit = 20,
): Promise<PagedIncomeRow[]> {
  const { group } = await getViewerReadContext()
  const rows = await listInsuranceReturnsPaged(assetId, group.id, categories, cursor, limit)
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
}
