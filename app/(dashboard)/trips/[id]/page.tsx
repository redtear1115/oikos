import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getTripById } from '@/lib/db/queries/trips'
import { listTripExpenses } from '@/lib/db/queries/tripExpense'
import type { CurrencyCode } from '@/lib/currency'
import { TripDetailClient, type TripDetailRecord } from './_components/TripDetailClient'

export default async function TripDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const { group } = await requireViewerGroupOrRedirect()
  const trip = await getTripById(id)
  if (!trip || trip.groupId !== group.id) notFound()

  const rawExpenses = await listTripExpenses(trip.id)

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
    />
  )
}
