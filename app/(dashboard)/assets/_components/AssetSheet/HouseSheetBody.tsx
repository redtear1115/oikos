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
  | 'houseHasAddress' | 'housePurchasedAt' | 'housePurchasePrice'
>

interface Props extends BodySharedProps {
  initial?: HouseInitial
}

export function HouseSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  const locale = useLocale()
  // #837 — address is encrypted PII; the form always starts blank (no plaintext
  // from the server). `hasAddress` enables 「先前已加密」 + 「清除」; same trinary
  // UX as ChildSheetBody's nationalId.
  const [address, setAddress] = useState('')
  const [hasAddress, setHasAddress] = useState(initial?.houseHasAddress ?? false)
  const [wantClearAddress, setWantClearAddress] = useState(false)
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
      setAddress('')
      setHasAddress(initial?.houseHasAddress ?? false)
      setWantClearAddress(false)
      setPurchasedAt(initial?.housePurchasedAt ?? '')
      setPurchasePrice(initial?.housePurchasePrice?.toString() ?? '')
      setShowCal(false)
    },
  })

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const base = {
      name: name.trim(),
      purchasedAt: purchasedAt || null,
      purchasePrice: purchasePrice ? parseInt(purchasePrice, 10) : null,
      notes: notes.trim() || null,
    }
    // #837 — address trinary on edit: typed string = set, blank + 「清除」 = null
    // (clear), blank alone = undefined (keep existing). On create there's no
    // existing value, so blank simply means null.
    const editAddress: string | null | undefined =
      address.trim().length > 0 ? address.trim() : (wantClearAddress ? null : undefined)
    runMutation(
      async () => {
        if (isEdit) {
          await editHouse({ id: initial!.id, ...base, address: editAddress })
        } else {
          await createHouse({ ...base, address: address.trim() || null })
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
        {/* Address — #837 encrypted PII; same trinary UX as child nationalId.
            blank + 「清除」 clears, blank alone on edit keeps, typed value sets.
            Generic encryptedHint / clear strings reused from `child`. */}
        <div className="flex flex-col gap-1">
          <label htmlFor={addressId} className="text-xs tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.address}</label>
          <div className="flex items-center gap-2">
            <input
              id={addressId}
              type="text"
              placeholder={
                wantClearAddress
                  ? ts.child.pendingClearHint
                  : (isEdit && hasAddress ? ts.child.encryptedHint : ts.house.addressPlaceholder)
              }
              value={address}
              onChange={e => {
                setAddress(e.target.value)
                if (wantClearAddress) setWantClearAddress(false)
              }}
              maxLength={80}
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
            />
            {isEdit && hasAddress && !wantClearAddress && address.trim() === '' && (
              <button
                type="button"
                onClick={() => setWantClearAddress(true)}
                className="text-xs px-2 py-1 rounded-md cursor-pointer border-0 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
              >
                {ts.child.clear}
              </button>
            )}
            {isEdit && wantClearAddress && (
              <button
                type="button"
                onClick={() => setWantClearAddress(false)}
                className="text-xs px-2 py-1 rounded-md cursor-pointer border-0 shrink-0"
                style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
              >
                {ts.child.cancelClear}
              </button>
            )}
          </div>
        </div>

        {/* Purchase date */}
        <div className="flex flex-col gap-1">
          <label htmlFor={purchaseDateId} className="text-xs tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.purchasedAt}</label>
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
          <label htmlFor={purchasePriceId} className="text-xs tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>{ts.house.purchasePrice}</label>
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
