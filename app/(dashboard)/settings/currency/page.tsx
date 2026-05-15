import { getCurrentUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { cashTransactions, incomeTransactions, settlements } from '@/lib/db/schema'
import { and, count, eq, gte, isNull } from 'drizzle-orm'
import { listRatesForGroup } from '@/lib/db/queries/currencyRates'
import { listActiveTrips } from '@/lib/db/queries/trips'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'
import { parseTripCurrencySnapshot } from '@/lib/trip-currency'
import type { TripOption } from '@/app/(dashboard)/dashboard/_components/TripSelector'
import type { RateEntry } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { CurrencySettings } from './_components/CurrencySettings'

export default async function CurrencySettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/sign-in')
  const context = await resolveViewerEpochContext(user.id)
  if (!context) redirect('/onboarding')
  const { group, window: epochWindow } = context

  const epochStart = group.currentEpochStartedAt
  const epochStartDate = epochStart.toISOString().slice(0, 10)

  const [cashRow, incomeRow, settlementRow, rawRates, rawActiveTrips] = await Promise.all([
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
    listRatesForGroup(group.id),
    epochWindow.epochId
      ? listActiveTrips(group.id, epochWindow.epochId)
      : Promise.resolve([]),
  ])
  const recordCount = Number(cashRow[0].n) + Number(incomeRow[0].n) + Number(settlementRow[0].n)

  const rates: RateEntry[] = rawRates.map((r) => ({
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: r.rate,
  }))

  const activeTrips: TripOption[] = rawActiveTrips.map((trip) => ({
    id: trip.id,
    name: trip.name,
    defaultCurrency: trip.defaultCurrency,
    startDate: trip.startDate,
    endDate: trip.endDate ?? null,
    currencies: parseTripCurrencySnapshot(
      trip.rateSnapshot,
      trip.defaultCurrency ?? group.baseCurrency,
    ),
  }))

  return (
    <div className="relative min-h-dvh pb-[var(--bottom-nav-offset)]">
      <CurrencySettings
        baseCurrency={group.baseCurrency}
        canChangeBase={recordCount === 0}
        groupDefaultRatioA={group.defaultSplitRatioA ?? null}
        activeTrips={activeTrips}
        rates={rates}
        isPast={epochWindow.isPast}
      />
    </div>
  )
}
