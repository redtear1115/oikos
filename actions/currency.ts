'use server'

import { db } from '@/lib/db/client'
import { oikosGroups, cashTransactions, incomeTransactions, settlements } from '@/lib/db/schema'
import { eq, and, isNull, gte, count } from 'drizzle-orm'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { upsertRate } from '@/lib/db/queries/currencyRates'
import { revalidatePath } from 'next/cache'

export async function setBaseCurrency(input: { currency: CurrencyCode }) {
  const { group } = await requireViewerGroup()
  if (!CURRENCIES.includes(input.currency)) {
    throw new Error('不支援的幣別')
  }
  if (input.currency === group.baseCurrency) {
    return  // no-op
  }

  const epochStart = group.currentEpochStartedAt
  const epochStartDate = epochStart.toISOString().slice(0, 10)

  const [cashRow] = await db
    .select({ n: count() })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, group.id),
      gte(cashTransactions.transactedAt, epochStart),
      isNull(cashTransactions.deletedAt),
    ))
  const [incomeRow] = await db
    .select({ n: count() })
    .from(incomeTransactions)
    .where(and(
      eq(incomeTransactions.groupId, group.id),
      gte(incomeTransactions.occurredAt, epochStartDate),
      isNull(incomeTransactions.deletedAt),
    ))
  const [settlementRow] = await db
    .select({ n: count() })
    .from(settlements)
    .where(and(
      eq(settlements.groupId, group.id),
      gte(settlements.settledAt, epochStart),
      isNull(settlements.deletedAt),
    ))

  if (Number(cashRow.n) + Number(incomeRow.n) + Number(settlementRow.n) > 0) {
    throw new Error('當前章節已有紀錄、不可修改主體幣別')
  }

  await db
    .update(oikosGroups)
    .set({ baseCurrency: input.currency })
    .where(eq(oikosGroups.id, group.id))

  revalidatePath('/settings/currency')
}

export async function setRate(input: {
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: string
}) {
  const { group } = await requireViewerGroup()
  if (input.fromCurrency === input.toCurrency) throw new Error('來源與目標幣別不能相同')
  const parsed = parseFloat(input.rate)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('匯率必須是正數')
  await upsertRate({
    groupId: group.id,
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    rate: input.rate,
  })
  revalidatePath('/settings/currency')
}
