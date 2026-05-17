'use client'

import { useState, useId } from 'react'
import { CalIcon } from '@/app/(dashboard)/_components/sheet-icons'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { localTodayISO } from '@/lib/local-date'
import { formatDateAbsolute } from '@/lib/format-date'
import { useLocale } from '@/lib/i18n/client'
import { createHouse, editHouse } from '@/actions/asset'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import { useAssetSheetCommon } from './shared/useAssetSheetCommon'
import type { AssetSheetInitial, BodySharedProps } from './types'

export type HouseInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'houseAddress' | 'housePurchasedAt' | 'housePurchasePrice'
>

interface Props extends BodySharedProps {
  initial?: HouseInitial
}

export function HouseSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  const locale = useLocale()
  const [address, setAddress] = useState(initial?.houseAddress ?? '')
  const [purchasedAt, setPurchasedAt] = useState(initial?.housePurchasedAt ?? '')
  const [purchasePrice, setPurchasePrice] = useState(initial?.housePurchasePrice?.toString() ?? '')
  const [showCal, setShowCal] = useState(false)
  const addressId = useId()
  const purchaseDateId = useId()
  const purchasePriceId = useId()

  const {
    isEdit, name, setName, notes, setNotes, pending, error,
    nameInputRef, ts, performDelete, runMutation,
  } = useAssetSheetCommon({
    open, initial, onClose, onMutated,
    resetDomain: () => {
      setAddress(initial?.houseAddress ?? '')
      setPurchasedAt(initial?.housePurchasedAt ?? '')
      setPurchasePrice(initial?.housePurchasePrice?.toString() ?? '')
      setShowCal(false)
    },
  })

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const payload = {
      name: name.trim(),
      address: address.trim() || null,
      purchasedAt: purchasedAt || null,
      purchasePrice: purchasePrice ? parseInt(purchasePrice, 10) : null,
      notes: notes.trim() || null,
    }
    runMutation(
      async () => {
        if (isEdit) {
          await editHouse({ id: initial!.id, ...payload })
        } else {
          await createHouse(payload)
        }
      },
      () => { onMutated?.('saved'); onClose() },
    )
  }

  const title = isEdit ? ts.titleEdit.replace('{type}', ts.type.house) : ts.titleNew

  return (
    <SheetShell
      open={open}
      title={title}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={isEdit ? ts.saveChanges : ts.titleNew}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      {typePickerSlot}

      <NameField
        ref={nameInputRef}
        label={ts.name.label}
        value={name}
        onChange={setName}
        placeholder={ts.name.placeholderHouse}
      />

      <div className="flex flex-col gap-3 px-5 pb-2">
        {/* Address */}
        <div className="flex flex-col gap-1">
          <label htmlFor={addressId} className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.address}</label>
          <input
            id={addressId}
            type="text"
            placeholder={ts.house.addressPlaceholder}
            value={address}
            onChange={e => setAddress(e.target.value)}
            maxLength={80}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
          />
        </div>

        {/* Purchase date */}
        <div className="flex flex-col gap-1">
          <label htmlFor={purchaseDateId} className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.purchasedAt}</label>
          <button
            id={purchaseDateId}
            type="button"
            onClick={() => setShowCal(c => !c)}
            className="w-full rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between"
            style={{ background: 'var(--surface)', color: purchasedAt ? 'var(--ink)' : 'var(--ink-3)', border: '1.5px solid var(--border)' }}
          >
            <span>{purchasedAt ? formatDateAbsolute(purchasedAt, locale) : ts.house.pickDate}</span>
            <CalIcon size={16} />
          </button>
          {showCal && (
            <MiniCalendar
              value={purchasedAt || localTodayISO()}
              onChange={d => { setPurchasedAt(d); setShowCal(false) }}
            />
          )}
        </div>

        {/* Purchase price */}
        <div className="flex flex-col gap-1">
          <label htmlFor={purchasePriceId} className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.purchasePrice}</label>
          <input
            id={purchasePriceId}
            type="number"
            inputMode="numeric"
            placeholder={ts.house.purchasePricePlaceholder}
            value={purchasePrice}
            onChange={e => setPurchasePrice(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none"
            style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
          />
        </div>
      </div>

      <NotesField
        label={ts.notes.label}
        placeholder={ts.notes.placeholder}
        value={notes}
        onChange={setNotes}
      />

      {isEdit && <DeleteConfirmFlow pending={pending} onDelete={performDelete} />}
    </SheetShell>
  )
}
