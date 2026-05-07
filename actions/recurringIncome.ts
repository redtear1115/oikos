'use server'

import { db } from '@/lib/db/client'
import {
  assets,
  oikosGroups,
  recurringIncomeRules,
} from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import {
  validateRecurringIncomeRuleInput,
  type RecurringIncomeRuleInput,
} from '@/lib/validators'
import { computeNextOccurrence } from '@/lib/recurringIncome'
import { and, eq, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

async function getViewerGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')
  return { user, group }
}

function assertRecipientInGroup(
  recipientId: string,
  group: { memberA: string; memberB: string | null },
) {
  if (recipientId !== group.memberA && recipientId !== group.memberB) {
    throw new Error('收入歸屬不在家計簿內')
  }
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

function firstAnchorFromStart(startsOn: string, dayOfMonth: number, intervalMonths: number): string {
  const [y, m] = startsOn.split('-').map(Number)
  const lastThis = new Date(y, m, 0).getDate()
  const candThis = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dayOfMonth, lastThis)).padStart(2, '0')}`
  if (candThis >= startsOn) return candThis
  return computeNextOccurrence(candThis, intervalMonths, dayOfMonth)
}

export async function createRule(input: RecurringIncomeRuleInput): Promise<{ id: string }> {
  const v = validateRecurringIncomeRuleInput(input)
  const { group } = await getViewerGroup()
  assertRecipientInGroup(v.recipientId, group)
  if (v.assetId) await assertAssetInGroup(v.assetId, group.id)

  const nextOccurrenceAt = firstAnchorFromStart(v.startsOn, v.dayOfMonth, v.intervalMonths)

  const [created] = await db
    .insert(recurringIncomeRules)
    .values({
      groupId: group.id,
      recipientId: v.recipientId,
      amount: v.amount,
      category: v.category,
      source: v.source,
      assetId: v.assetId,
      intervalMonths: v.intervalMonths,
      dayOfMonth: v.dayOfMonth,
      startsOn: v.startsOn,
      endsOn: v.endsOn,
      nextOccurrenceAt,
    })
    .returning({ id: recurringIncomeRules.id })

  revalidatePath('/settings/recurring-income')
  revalidatePath('/dashboard')
  return { id: created.id }
}
