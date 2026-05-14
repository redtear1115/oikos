import { notFound } from 'next/navigation'
import { requireViewerGroupOrRedirect } from '@/lib/auth/viewer'
import { getTripById, listTripRecords } from '@/lib/db/queries/trips'
import { formatAmount } from '@/lib/currency'

export default async function TripDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const { group } = await requireViewerGroupOrRedirect()
  const trip = await getTripById(id)
  if (!trip || trip.groupId !== group.id) notFound()

  const records = await listTripRecords(trip.id)
  const totalBase = records.reduce((sum, r) => sum + r.amount, 0)
  const displayCurrency = trip.defaultCurrency ?? group.baseCurrency

  return (
    <div className="px-4 py-6 space-y-4">
      <header>
        <h1 className="text-xl font-medium">{trip.name}</h1>
        <p className="text-sm text-gray-500">
          {trip.startDate} – {trip.endDate ?? '進行中'}
        </p>
      </header>

      <section className="rounded border p-4">
        <p className="text-xs text-gray-500">總額（base）</p>
        <p className="text-2xl font-medium">{formatAmount(totalBase, group.baseCurrency)}</p>
        {displayCurrency !== group.baseCurrency && (
          <p className="text-xs text-gray-400 mt-1">
            預設記帳幣別：{displayCurrency.toUpperCase()}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm text-gray-500 mb-2">紀錄</h2>
        {records.length === 0 ? (
          <p className="text-sm text-gray-500">這趟還沒有任何紀錄</p>
        ) : (
          <ul className="space-y-1">
            {records.map(r => (
              <li key={r.id} className="flex justify-between text-sm py-1.5 border-b">
                <span>{r.description}</span>
                <span>
                  {r.originalCurrency
                    ? formatAmount(r.originalAmount ?? 0, r.originalCurrency)
                    : formatAmount(r.amount, group.baseCurrency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
