import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { db } from '@/lib/db/client'
import { cashTransactions, incomeTransactions, settlements } from '@/lib/db/schema'
import { and, count, eq, gte, isNull } from 'drizzle-orm'
import { CurrencySettings } from './_components/CurrencySettings'
import { BottomNavSkeleton } from '@/app/(dashboard)/_components/BottomNavSkeleton'

export default async function CurrencySettingsPage() {
  const { group } = await requireViewerGroupOrRedirect()
  const epochStart = group.currentEpochStartedAt
  const epochStartDate = epochStart.toISOString().slice(0, 10)

  const [cashRow, incomeRow, settlementRow] = await Promise.all([
    db.select({ n: count() }).from(cashTransactions).where(and(
      eq(cashTransactions.groupId, group.id),
      gte(cashTransactions.transactedAt, epochStart),
      isNull(cashTransactions.deletedAt),
    )),
    db.select({ n: count() }).from(incomeTransactions).where(and(
      eq(incomeTransactions.groupId, group.id),
      gte(incomeTransactions.occurredAt, epochStartDate),
      isNull(incomeTransactions.deletedAt),
    )),
    db.select({ n: count() }).from(settlements).where(and(
      eq(settlements.groupId, group.id),
      gte(settlements.settledAt, epochStart),
      isNull(settlements.deletedAt),
    )),
  ])
  const recordCount = Number(cashRow[0].n) + Number(incomeRow[0].n) + Number(settlementRow[0].n)

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <CurrencySettings
        baseCurrency={group.baseCurrency}
        canChangeBase={recordCount === 0}
      />
      <BottomNavSkeleton />
    </div>
  )
}
