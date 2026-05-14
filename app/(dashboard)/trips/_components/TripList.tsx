'use client'

import Link from 'next/link'
import { useState } from 'react'
import { TripSheet } from './TripSheet'
import type { CurrencyCode } from '@/lib/currency'

type Trip = {
  id: string
  name: string
  startDate: string
  endDate: string | null
  defaultCurrency: CurrencyCode | null
  status: 'active' | 'ended' | 'archived'
}

export function TripList(props: { trips: Trip[]; baseCurrency: CurrencyCode }) {
  const [open, setOpen] = useState(false)
  const active = props.trips.filter(t => t.status === 'active')
  const past = props.trips.filter(t => t.status !== 'active')

  return (
    <div className="px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-medium">旅行</h1>
        <button
          className="rounded bg-black text-white px-3 py-1.5 text-sm"
          onClick={() => setOpen(true)}
        >
          建立旅行
        </button>
      </header>

      {active.length > 0 && (
        <section>
          <h2 className="text-sm text-gray-500 mb-2">進行中</h2>
          <ul className="space-y-2">
            {active.map(t => (
              <li key={t.id}>
                <Link href={`/trips/${t.id}`} className="block rounded border p-3">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-gray-500">
                    {t.startDate} – {t.endDate ?? '進行中'}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm text-gray-500 mb-2">過去</h2>
          <ul className="space-y-2">
            {past.map(t => (
              <li key={t.id}>
                <Link href={`/trips/${t.id}`} className="block rounded border p-3 opacity-70">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.startDate} – {t.endDate}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {props.trips.length === 0 && (
        <p className="text-sm text-gray-500">還沒有旅行紀錄</p>
      )}

      {open && (
        <TripSheet
          baseCurrency={props.baseCurrency}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
