'use client'

import { useState } from 'react'
import { createPlant, editPlant } from '@/actions/asset'
import { Field } from './shared/Field'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import { useAssetSheetCommon } from './shared/useAssetSheetCommon'
import type { AssetSheetInitial, BodySharedProps } from './types'

export type PlantInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'plantSpecies' | 'plantLocation' | 'plantSproutedAt'
  | 'plantCost' | 'plantWaterEvery'
>

interface Props extends BodySharedProps {
  initial?: PlantInitial
}

export function PlantSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  const [species, setSpecies] = useState(initial?.plantSpecies ?? '')
  const [location, setLocation] = useState(initial?.plantLocation ?? '')
  const [sproutedAt, setSproutedAt] = useState(initial?.plantSproutedAt ?? '')
  const [cost, setCost] = useState(initial?.plantCost?.toString() ?? '')
  const [waterEvery, setWaterEvery] = useState<number | null>(initial?.plantWaterEvery ?? 7)

  const {
    isEdit, name, setName, notes, setNotes, pending, error,
    nameInputRef, ts, performDelete, runMutation,
  } = useAssetSheetCommon({
    open, initial, onClose, onMutated,
    resetDomain: () => {
      setSpecies(initial?.plantSpecies ?? '')
      setLocation(initial?.plantLocation ?? '')
      setSproutedAt(initial?.plantSproutedAt ?? '')
      setCost(initial?.plantCost?.toString() ?? '')
      setWaterEvery(initial?.plantWaterEvery ?? 7)
    },
  })

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const payload = {
      name: name.trim(),
      species: species.trim() || null,
      location: location.trim() || null,
      sproutedAt: sproutedAt || null,
      cost: cost ? parseInt(cost, 10) : null,
      waterEvery,
      notes: notes.trim() || null,
    }
    runMutation(
      async () => {
        if (isEdit) {
          await editPlant({ id: initial!.id, ...payload })
        } else {
          await createPlant(payload)
        }
      },
      () => { onMutated?.('saved'); onClose() },
    )
  }

  const title = isEdit ? ts.titleEdit.replace('{type}', ts.type.plant) : ts.titleNew

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
        placeholder={ts.name.placeholderPlant}
      />

      <div className="flex gap-2">
        <div className="flex-1">
          <Field label={ts.plant.species}>
            {id => (
              <input id={id} value={species} onChange={e => setSpecies(e.target.value.slice(0, 32))}
                placeholder={ts.plant.speciesPlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
                style={{ color: 'var(--ink)' }} />
            )}
          </Field>
        </div>
        <div className="flex-1">
          <Field label={ts.plant.location}>
            {id => (
              <input id={id} value={location} onChange={e => setLocation(e.target.value.slice(0, 32))}
                placeholder={ts.plant.locationPlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
                style={{ color: 'var(--ink)' }} />
            )}
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Field label={ts.plant.sproutedAt}>
            {id => (
              <input id={id} value={sproutedAt} onChange={e => setSproutedAt(e.target.value)}
                type="date" className="w-full bg-transparent border-0 outline-none text-base"
                style={{ color: 'var(--ink)' }} />
            )}
          </Field>
        </div>
        <div className="flex-1">
          <Field label={ts.plant.cost}>
            {id => (
              <>
                <input id={id} value={cost} onChange={e => setCost(e.target.value)}
                  type="number" inputMode="numeric" placeholder={ts.plant.costPlaceholder}
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
              </>
            )}
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.plant.sectionCare}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.plant.waterEvery}>
        <div className="flex gap-1.5">
          {[2, 3, 7, 14, 30].map(d => (
            <button key={d} type="button" onClick={() => setWaterEvery(d)}
              className="flex-1 h-10 rounded-[10px] text-label font-semibold"
              style={{
                border: waterEvery === d ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: waterEvery === d ? 'rgba(58,36,25,0.04)' : '#fff',
                color: waterEvery === d ? 'var(--ink)' : 'var(--ink-2)',
                fontFamily: 'var(--font-numeric)',
              }}>{d}</button>
          ))}
          <span className="self-center text-xs ml-1" style={{ color: 'var(--ink-3)' }}>{ts.plant.waterEverySuffix}</span>
        </div>
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
