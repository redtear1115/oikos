import { getCurrentUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listRatesForGroup } from '@/lib/db/queries/currencyRates'
import { listActiveTrips } from '@/lib/db/queries/trips'
import { currentEpochHasRecords, resolveViewerEpochContext } from '@/lib/db/queries/epoch'
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

  // Same question, same answer as the server action's guard — see
  // `currentEpochHasRecords`. Asking it here rather than counting rows inline is
  // what keeps the disabled selector honest about what the action will do.
  const [hasRecords, rawRates, rawActiveTrips] = await Promise.all([
    currentEpochHasRecords(group),
    listRatesForGroup(group.id),
    epochWindow.epochId
      ? listActiveTrips(group.id, epochWindow.epochId)
      : Promise.resolve([]),
  ])

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
        canChangeBase={!hasRecords}
        groupDefaultRatioA={group.defaultSplitRatioA ?? null}
        activeTrips={activeTrips}
        rates={rates}
        isPast={epochWindow.isPast}
      />
    </div>
  )
}
