import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getTripById, listTripRecords } from '@/lib/db/queries/trips'
import type { CurrencyCode } from '@/lib/currency'
import { TripDetailClient, type TripDetailRecord } from './_components/TripDetailClient'

export default async function TripDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const { group } = await requireViewerGroupOrRedirect()
  const trip = await getTripById(id)
  if (!trip || trip.groupId !== group.id) notFound()

  const rawRecords = await listTripRecords(trip.id)

  const records: TripDetailRecord[] = rawRecords.map((r) => ({
    id: r.id,
    amount: r.amount,
    splitType: r.splitType,
    splitRatioA: r.splitRatioA,
    description: r.description,
    category: r.category,
    paidBy: r.paidBy,
    transactedAt: r.transactedAt.toISOString(),
    status: r.status,
    notes: r.notes,
    originalCurrency: r.originalCurrency,
    originalAmount: r.originalAmount,
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
    />
  )
}
