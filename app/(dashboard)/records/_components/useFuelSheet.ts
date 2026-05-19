'use client'

import { useState, useTransition } from 'react'
import { getFuelLogById } from '@/actions/fuelLog'
import type { NewFuelLogInitial } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import type { PagedTxnRow } from '@/actions/transaction'
import type { FuelType } from '@/lib/fuel'

export type FuelCar = {
  id: string
  name: string
  plate: string
  fuelType: FuelType | null
  primaryUserId: string | null
}

/**
 * Fuel-log edit sheet state. Opening from a transaction row is a multi-step
 * operation (load detail → seed sheet initial → seed car → open) and was
 * previously spread across three useStates + a useTransition at the RecordsList
 * call site. This hook bundles all four so the parent gets a single
 * `fuel.openFromTx(tx)` entrypoint and three read accessors.
 */
export function useFuelSheet() {
  const [open, setOpen] = useState(false)
  const [initial, setInitial] = useState<NewFuelLogInitial | null>(null)
  const [car, setCar] = useState<FuelCar | null>(null)
  const [, startLoad] = useTransition()

  const openFromTx = (tx: PagedTxnRow) => {
    if (tx.fuelLogId === null) return
    startLoad(async () => {
      const detail = await getFuelLogById(tx.fuelLogId!)
      if (!detail) return  // stale or unauthorized — silently skip
      setInitial({
        fuelLogId: detail.id,
        transactionId: tx.id,
        liters: detail.liters,
        odometer: detail.odometer,
        station: detail.station,
        fuelType: detail.fuelType === '98' ? '98' : detail.fuelType === 'diesel' ? 'diesel' : '95',
        loggedAt: detail.loggedAt,
        cost: tx.amount,
        paidBy: tx.paidBy,
        splitType: tx.splitType ?? 'all_mine',
      })
      setCar({
        id: detail.assetId,
        name: detail.carName,
        plate: detail.carPlate ?? '',
        fuelType: detail.carFuelType,
        primaryUserId: detail.carPrimaryUserId,
      })
      setOpen(true)
    })
  }

  const close = () => setOpen(false)

  return { open, initial, car, openFromTx, close }
}
