'use client'

import { useState } from 'react'
import { FuelTypeButtonGroup } from '@/app/(dashboard)/_components/FuelTypeButtonGroup'
import { PrimaryUserToggle } from '@/app/(dashboard)/_components/PrimaryUserToggle'
import { createCar, editCar } from '@/actions/asset'
import { Field } from './shared/Field'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { DateField } from '@/app/(dashboard)/_components/DateField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import { useAssetSheetCommon } from './shared/useAssetSheetCommon'
import type { AssetSheetInitial, BodySharedProps } from './types'
import type { GasFuelType } from '@/lib/fuel'

const CAR_COLORS = [
  { key: 'white',     hex: '#F0EDE8', border: '#D4CFC7' },
  { key: 'black',     hex: '#1C1C1E', border: '#1C1C1E' },
  { key: 'silver',    hex: '#B8B8C0', border: '#B8B8C0' },
  { key: 'dark_gray', hex: '#4A4A52', border: '#4A4A52' },
  { key: 'dark_red',  hex: '#7B2525', border: '#7B2525' },
  { key: 'dark_blue', hex: '#1E3557', border: '#1E3557' },
  { key: 'brown',     hex: '#7A5C3E', border: '#7A5C3E' },
  { key: 'champagne', hex: '#C8A97A', border: '#C8A97A' },
] as const

export type CarInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'carHasPlate' | 'purchasedAt' | 'purchasePrice' | 'fuelType' | 'primaryUserId'
  | 'color' | 'year' | 'brand' | 'model' | 'initialOdometer'
>

interface Props extends BodySharedProps {
  initial?: CarInitial
}

export function CarSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  // #837 — plate is encrypted PII; the form always starts blank (we never
  // receive plaintext). `hasPlate` tells us an encrypted value exists so we can
  // show 「先前已加密」 + 「清除」; `wantClearPlate` is the cleared sentinel.
  // Same trinary UX as ChildSheetBody's nationalId.
  const [plate, setPlate] = useState('')
  const [hasPlate, setHasPlate] = useState(initial?.carHasPlate ?? false)
  const [wantClearPlate, setWantClearPlate] = useState(false)
  const [purchasedAt, setPurchasedAt] = useState<string | null>(initial?.purchasedAt ?? null)
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice ? String(initial.purchasePrice) : '')
  const [fuelType, setFuelType] = useState<GasFuelType>(initial?.fuelType ?? '95')
  const [primaryUserId, setPrimaryUserId] = useState<string | null>(initial?.primaryUserId ?? null)
  const [color, setColor] = useState<string | null>(initial?.color ?? null)
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '')
  const [brand, setBrand] = useState(initial?.brand ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [initialOdometer, setInitialOdometer] = useState(initial?.initialOdometer ? String(initial.initialOdometer) : '')

  const {
    isEdit, name, setName, notes, setNotes, pending, error,
    nameInputRef, ts, performDelete, runMutation,
  } = useAssetSheetCommon({
    open, initial, onClose, onMutated,
    resetDomain: () => {
      setPlate('')
      setHasPlate(initial?.carHasPlate ?? false)
      setWantClearPlate(false)
      setPurchasedAt(initial?.purchasedAt ?? null)
      setPurchasePrice(initial?.purchasePrice ? String(initial.purchasePrice) : '')
      setFuelType(initial?.fuelType ?? '95')
      setPrimaryUserId(initial?.primaryUserId ?? null)
      setColor(initial?.color ?? null)
      setYear(initial?.year ? String(initial.year) : '')
      setBrand(initial?.brand ?? '')
      setModel(initial?.model ?? '')
      setInitialOdometer(initial?.initialOdometer ? String(initial.initialOdometer) : '')
    },
  })

  // #837 — plate required on create; on edit the field may stay blank (= keep
  // the existing encrypted value), so only the name gates save in edit mode.
  const canSave = name.trim() !== '' && (isEdit || plate.trim() !== '') && !pending

  const handleSave = () => {
    const notesPayload = notes.trim() || null
    const price = purchasePrice ? parseInt(purchasePrice, 10) : null
    // #837 — plate trinary on edit: typed string = set, blank + 「清除」 = null
    // (clear), blank alone = undefined (keep existing encrypted value).
    const editPlate: string | null | undefined =
      plate.trim().length > 0
        ? plate.trim()
        : (wantClearPlate ? null : undefined)
    runMutation(
      async () => {
        if (isEdit) {
          await editCar({
            id: initial!.id,
            name: name.trim(),
            plate: editPlate,
            purchasedAt,
            purchasePrice: price,
            fuelType,
            primaryUserId,
            color,
            year: year ? parseInt(year, 10) : null,
            brand: brand.trim() || null,
            model: model.trim() || null,
            initialOdometer: initialOdometer ? parseInt(initialOdometer.replace(/,/g, ''), 10) : null,
            notes: notesPayload,
          })
        } else {
          await createCar({
            name: name.trim(),
            plate: plate.trim(),
            purchasedAt: purchasedAt ?? undefined,
            purchasePrice: price ?? undefined,
            fuelType,
            primaryUserId,
            color,
            year: year ? parseInt(year, 10) : null,
            brand: brand.trim() || null,
            model: model.trim() || null,
            initialOdometer: initialOdometer ? parseInt(initialOdometer.replace(/,/g, ''), 10) : null,
            notes: notesPayload,
          })
        }
      },
      () => { onMutated?.('saved'); onClose() },
    )
  }

  const title = isEdit ? ts.titleEdit.replace('{type}', ts.type.car) : ts.titleNew

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
        placeholder={ts.name.placeholderCar}
      />

      <Field label={ts.car.color}>
        <div className="flex gap-2 flex-wrap">
          {CAR_COLORS.map(c => {
            const sel = color === c.hex
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setColor(c.hex)}
                className="w-9 h-9 rounded-full transition-all"
                style={{
                  background: c.hex,
                  border: sel ? '3px solid var(--ink)' : `2px solid ${c.border}`,
                  boxShadow: sel ? '0 0 0 2px var(--bg), 0 0 0 4px var(--ink)' : 'none',
                }}
                aria-label={c.key}
              />
            )
          })}
          {/* No color option */}
          <button
            type="button"
            onClick={() => setColor(null)}
            className="w-9 h-9 rounded-full transition-all flex items-center justify-center text-micro"
            style={{
              border: color === null ? '3px solid var(--ink)' : '1.5px solid var(--hairline)',
              background: 'transparent',
              color: 'var(--ink-3)',
              boxShadow: color === null ? '0 0 0 2px var(--bg), 0 0 0 4px var(--ink)' : 'none',
            }}
            aria-label={ts.car.colorNoneAriaLabel}
          >
            —
          </button>
        </div>
      </Field>

      {/* #837 — plate is encrypted PII. Same trinary UX as child nationalId:
          blank + 「清除」 clears, blank alone on edit keeps, a typed value sets.
          The generic encryptedHint / clear strings are reused from `child`. */}
      <Field label={ts.car.plate}>
        {id => (
          <div className="flex items-center gap-2">
            <input
              id={id}
              value={plate}
              onChange={e => {
                setPlate(e.target.value.slice(0, 16))
                if (wantClearPlate) setWantClearPlate(false)
              }}
              placeholder={
                wantClearPlate
                  ? ts.child.pendingClearHint
                  : (isEdit && hasPlate ? ts.child.encryptedHint : ts.car.platePlaceholder)
              }
              className="flex-1 bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
            />
            {isEdit && hasPlate && !wantClearPlate && plate.trim() === '' && (
              <button
                type="button"
                onClick={() => setWantClearPlate(true)}
                className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
                style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
              >
                {ts.child.clear}
              </button>
            )}
            {isEdit && wantClearPlate && (
              <button
                type="button"
                onClick={() => setWantClearPlate(false)}
                className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
                style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
              >
                {ts.child.cancelClear}
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label={ts.car.year}>
        {id => (
          <input
            id={id}
            value={year}
            onChange={e => setYear(e.target.value.slice(0, 4))}
            type="number"
            inputMode="numeric"
            placeholder={ts.car.yearPlaceholder}
            className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }}
          />
        )}
      </Field>

      <Field label={ts.car.brand}>
        {id => (
          <input
            id={id}
            value={brand}
            onChange={e => setBrand(e.target.value.slice(0, 32))}
            placeholder={ts.car.brandPlaceholder}
            className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }}
          />
        )}
      </Field>

      <Field label={ts.car.model}>
        {id => (
          <input
            id={id}
            value={model}
            onChange={e => setModel(e.target.value.slice(0, 32))}
            placeholder={ts.car.modelPlaceholder}
            className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }}
          />
        )}
      </Field>

      <DateField
        label={ts.car.purchasedAt}
        value={purchasedAt}
        onChange={setPurchasedAt}
        placeholder={ts.car.pickDate}
      />

      <Field label={ts.car.purchasePrice}>
        {id => (
          <div className="flex items-center gap-1">
            <span className="text-sm" style={{ color: 'var(--ink-3)' }}>NT$</span>
            <input
              id={id}
              value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="0"
              inputMode="numeric"
              className="flex-1 bg-transparent border-0 outline-none text-base tnum"
              style={{ color: 'var(--ink)' }}
            />
          </div>
        )}
      </Field>

      <Field label={ts.car.initialOdometer}>
        {id => (
          <div className="flex items-center gap-1">
            <input
              id={id}
              value={initialOdometer}
              onChange={e => setInitialOdometer(e.target.value)}
              type="number"
              inputMode="numeric"
              placeholder={ts.car.initialOdometerPlaceholder}
              className="flex-1 bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
            />
            <span className="text-sm" style={{ color: 'var(--ink-3)' }}>km</span>
          </div>
        )}
      </Field>

      <Field label={ts.car.fuelType}>
        <FuelTypeButtonGroup value={fuelType} onChange={setFuelType} />
      </Field>

      {/* Primary User (hidden in solo mode — PrimaryUserToggle returns null) */}
      <Field label={ts.car.primaryUser}>
        <PrimaryUserToggle value={primaryUserId} onChange={setPrimaryUserId} />
      </Field>

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
