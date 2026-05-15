import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getTripById } from '@/lib/db/queries/trips'
import { listTripExpenses } from '@/lib/db/queries/tripExpense'
import { listRatesForGroup } from '@/lib/db/queries/currencyRates'
import type { CurrencyCode } from '@/lib/currency'
import type { TripOption } from '@/app/(dashboard)/dashboard/_components/TripSelector'
import type { RateEntry } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { TripDetailClient, type TripDetailRecord } from './_components/TripDetailClient'

export default async function TripDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const { group } = await requireViewerGroupOrRedirect()
  const trip = await getTripById(id)
  if (!trip || trip.groupId !== group.id) notFound()

  const [rawExpenses, rawRates] = await Promise.all([
    listTripExpenses(trip.id),
    listRatesForGroup(group.id),
  ])

  // TripExpenses store `splitRatio` as the payer's share %. The shared
  // CompactRow component expects `splitRatioA` (member A's share %), so we
  // re-frame here against the group's members.
  const records: TripDetailRecord[] = rawExpenses.map((r) => {
    const splitRatioA = r.splitRatio == null
      ? null
      : r.paidBy === group.memberA
        ? r.splitRatio
        : 100 - r.splitRatio
    return {
      id: r.id,
      amount: r.amount,
      splitType: r.splitType,
      splitRatioA,
      description: r.description ?? '',
      category: r.category,
      paidBy: r.paidBy,
      transactedAt: r.transactedAt.toISOString(),
      originalCurrency: r.originalCurrency,
      originalAmount: r.originalAmount,
    }
  })

  // Trip-detail FAB only needs this trip itself in the selector pool — the
  // record is locked to this trip via prefilledTripId. We still pass the row
  // so AddSheet can cascade defaultCurrency on open.
  const activeTrips: TripOption[] = [{
    id: trip.id,
    name: trip.name,
    defaultCurrency: (trip.defaultCurrency as CurrencyCode | null) ?? null,
    startDate: trip.startDate,
    endDate: trip.endDate ?? null,
  }]

  const rates: RateEntry[] = rawRates.map((r) => ({
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: r.rate,
  }))

  return (
    <TripDetailClient
      trip={{
        id: trip.id,
        name: trip.name,
        startDate: trip.startDate,
        endDate: trip.endDate,
        defaultCurrency: trip.defaultCurrency as CurrencyCode | null,
        status: trip.status,
      }}
      records={records}
      baseCurrency={group.baseCurrency}
      groupDefaultRatioA={group.defaultSplitRatioA ?? null}
      activeTrips={activeTrips}
      rates={rates}
    />
  )
}
