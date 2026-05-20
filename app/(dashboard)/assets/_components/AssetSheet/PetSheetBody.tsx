'use client'

import { useState } from 'react'
import { createPet, editPet } from '@/actions/asset'
import { TextInput } from '@/components/ui/TextInput'
import { Field } from './shared/Field'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import { useAssetSheetCommon } from './shared/useAssetSheetCommon'
import type { AssetSheetInitial, BodySharedProps } from './types'

export type PetInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'petSpecies' | 'petBreed' | 'petSex' | 'petBirthDate' | 'petAdoptedDate'
  | 'petPurchaseCost' | 'petWeightG' | 'petChipNo' | 'petVet'
>

interface Props extends BodySharedProps {
  initial?: PetInitial
}

export function PetSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  const initSex = (initial?.petSex === 'male' || initial?.petSex === 'female' || initial?.petSex === 'unknown') ? initial.petSex : null
  const [species, setSpecies] = useState(initial?.petSpecies ?? '')
  const [breed, setBreed] = useState(initial?.petBreed ?? '')
  const [sex, setSex] = useState<'male' | 'female' | 'unknown' | null>(initSex)
  const [birthDate, setBirthDate] = useState(initial?.petBirthDate ?? '')
  const [adoptedDate, setAdoptedDate] = useState(initial?.petAdoptedDate ?? '')
  const [cost, setCost] = useState(initial?.petPurchaseCost?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(initial?.petWeightG ? (initial.petWeightG / 1000).toFixed(1) : '')
  const [chipNo, setChipNo] = useState(initial?.petChipNo ?? '')
  const [vet, setVet] = useState(initial?.petVet ?? '')

  const {
    isEdit, name, setName, notes, setNotes, pending, error,
    nameInputRef, ts, performDelete, runMutation,
  } = useAssetSheetCommon({
    open, initial, onClose, onMutated,
    resetDomain: () => {
      setSpecies(initial?.petSpecies ?? '')
      setBreed(initial?.petBreed ?? '')
      setSex((initial?.petSex === 'male' || initial?.petSex === 'female' || initial?.petSex === 'unknown') ? initial.petSex : null)
      setBirthDate(initial?.petBirthDate ?? '')
      setAdoptedDate(initial?.petAdoptedDate ?? '')
      setCost(initial?.petPurchaseCost?.toString() ?? '')
      setWeightKg(initial?.petWeightG ? (initial.petWeightG / 1000).toFixed(1) : '')
      setChipNo(initial?.petChipNo ?? '')
      setVet(initial?.petVet ?? '')
    },
  })

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const payload = {
      name: name.trim(),
      species: species.trim() || null,
      breed: breed.trim() || null,
      sex,
      birthDate: birthDate || null,
      adoptedDate: adoptedDate || null,
      purchaseCost: cost ? parseInt(cost, 10) : null,
      weightG: weightKg ? Math.round(parseFloat(weightKg) * 1000) : null,
      chipNo: chipNo.trim() || null,
      vet: vet.trim() || null,
      notes: notes.trim() || null,
    }
    runMutation(
      async () => {
        if (isEdit) {
          await editPet({ id: initial!.id, ...payload })
        } else {
          await createPet(payload)
        }
      },
      () => { onMutated?.('saved'); onClose() },
    )
  }

  const title = isEdit ? ts.titleEdit.replace('{type}', ts.type.pet) : ts.titleNew

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
        placeholder={ts.name.placeholderPet}
      />

      <Field label={ts.pet.species}>
        <div className="flex flex-wrap gap-1.5">
          {[{v: 'cat', label: ts.pet.speciesCat},{v: 'dog', label: ts.pet.speciesDog},{v: 'rabbit', label: ts.pet.speciesRabbit},{v: 'bird', label: ts.pet.speciesBird},{v: 'fish', label: ts.pet.speciesFish},{v: 'other', label: ts.pet.speciesOther}].map(o => (
            <button key={o.v} type="button" onClick={() => setSpecies(o.v)}
              className="h-chip px-3.5 rounded-chip text-label"
              style={{
                border: species === o.v ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: species === o.v ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                color: species === o.v ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: species === o.v ? 600 : 500,
              }}>{o.label}</button>
          ))}
        </div>
      </Field>

      <Field label={ts.pet.breed}>
        {id => (
          <TextInput id={id} value={breed} onChange={e => setBreed(e.target.value.slice(0, 32))}
            placeholder={ts.pet.breedPlaceholder} />
        )}
      </Field>

      <Field label={ts.pet.sex}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--toggle-segment-track)' }}>
          {([{v: 'male' as const, label: ts.pet.sexMale}, {v: 'female' as const, label: ts.pet.sexFemale}, {v: 'unknown' as const, label: ts.pet.sexUnknown}]).map(o => {
            const sel = sex === o.v
            return (
              <button key={o.v} type="button" onClick={() => setSex(o.v)}
                className="oik-segment flex-1 h-9 rounded-[9px] text-sm font-medium"
                style={{
                  border: 'none',
                  background: sel ? 'var(--toggle-segment-thumb)' : 'transparent',
                  color: sel ? 'var(--ink)' : 'var(--ink-2)',
                  boxShadow: sel ? 'var(--toggle-segment-thumb-shadow)' : 'none',
                  transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
                }}>{o.label}</button>
            )
          })}
        </div>
      </Field>

      <Field label={ts.pet.birthDate}>
        {id => (
          <input id={id} value={birthDate} onChange={e => setBirthDate(e.target.value)}
            type="date" className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }} />
        )}
      </Field>

      <Field label={ts.pet.adoptedDate}>
        {id => (
          <input id={id} value={adoptedDate} onChange={e => setAdoptedDate(e.target.value)}
            type="date" className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }} />
        )}
      </Field>

      <Field label={ts.pet.purchaseCost}>
        {id => (
          <TextInput id={id} value={cost} onChange={e => setCost(e.target.value)}
            type="number" inputMode="numeric" placeholder={ts.pet.purchaseCostPlaceholder}
            rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>} />
        )}
      </Field>

      <Field label={ts.pet.weight}>
        {id => (
          <TextInput id={id} value={weightKg} onChange={e => setWeightKg(e.target.value)}
            type="number" inputMode="decimal" placeholder={ts.pet.weightPlaceholder}
            rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>kg</span>} />
        )}
      </Field>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.pet.sectionHealth}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.pet.chipNo}>
        {id => (
          <TextInput id={id} value={chipNo} onChange={e => setChipNo(e.target.value.slice(0, 20))}
            placeholder={ts.pet.chipNoPlaceholder} style={{ fontFamily: 'var(--font-numeric)' }} />
        )}
      </Field>

      <Field label={ts.pet.vet}>
        {id => (
          <TextInput id={id} value={vet} onChange={e => setVet(e.target.value.slice(0, 32))}
            placeholder={ts.pet.vetPlaceholder} />
        )}
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
