'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { CalIcon } from '@/app/(dashboard)/_components/sheet-icons'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { localTodayISO } from '@/lib/local-date'
import { formatDateAbsolute } from '@/lib/format-date'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { createHouse, editHouse, softDeleteAsset } from '@/actions/asset'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
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
  const isEdit = !!initial
  const locale = useLocale()
  const t = useTranslations()
  const ts = t.assetSheet
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.houseAddress ?? '')
  const [purchasedAt, setPurchasedAt] = useState(initial?.housePurchasedAt ?? '')
  const [purchasePrice, setPurchasePrice] = useState(initial?.housePurchasePrice?.toString() ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setAddress(initial?.houseAddress ?? '')
    setPurchasedAt(initial?.housePurchasedAt ?? '')
    setPurchasePrice(initial?.housePurchasePrice?.toString() ?? '')
    setNotes(initial?.notes ?? '')
    setShowCal(false)
    setError('')
    const id = setTimeout(() => nameInputRef.current?.focus(), 350)
    return () => clearTimeout(id)
  }, [open, initial])

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const notesPayload = notes.trim() || null
    startTransition(async () => {
      try {
        const payload = {
          name: name.trim(),
          address: address.trim() || null,
          purchasedAt: purchasedAt || null,
          purchasePrice: purchasePrice ? parseInt(purchasePrice, 10) : null,
          notes: notesPayload,
        }
        if (isEdit) {
          await editHouse({ id: initial!.id, ...payload })
        } else {
          await createHouse(payload)
        }
        onMutated?.('saved')
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  const performDelete = () => {
    if (!isEdit) return
    startTransition(async () => {
      try {
        await softDeleteAsset(initial!.id)
        onMutated?.('deleted')
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
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
          <label className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.address}</label>
          <input
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
          <label className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.purchasedAt}</label>
          <button
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
          <label className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.purchasePrice}</label>
          <input
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
