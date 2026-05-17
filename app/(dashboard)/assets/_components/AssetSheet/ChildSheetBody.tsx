'use client'

import { useState } from 'react'
import { formatNhi, NHI_MAX_LENGTH } from '@/lib/format-nhi'
import { createChild, editChild } from '@/actions/asset'
import { Field } from './shared/Field'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import { useAssetSheetCommon } from './shared/useAssetSheetCommon'
import type { AssetSheetInitial, BodySharedProps } from './types'

export type ChildInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'childNickname' | 'childGender' | 'childBirthday'
  | 'childHasNationalId' | 'childHasNhiNo'
  | 'childBloodType' | 'childHospital' | 'childHeightCm' | 'childWeightG'
>

interface Props extends BodySharedProps {
  initial?: ChildInitial
}

// PII state. nationalId / nhiNo are special:
//   - The form ALWAYS starts blank — we never receive plaintext from the
//     server (stored encrypted). When `hasX` is true, an existing encrypted
//     value lives on the server side; the user can leave the input blank
//     (= keep) or hit the 「清除」 button (= explicitly null).
//   - The "wantClear" flag is the cleared sentinel: when true, the value
//     submitted is `null` (clear column). When false and the input is empty,
//     the value submitted is `undefined` (keep existing). A non-empty input
//     overrides both and submits a string (encrypt + set).
export function ChildSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  const [nickname, setNickname] = useState(initial?.childNickname ?? '')
  const initGender = (initial?.childGender === 'male' || initial?.childGender === 'female') ? initial.childGender : null
  const [gender, setGender] = useState<'male' | 'female' | null>(initGender)
  const [birthday, setBirthday] = useState(initial?.childBirthday ?? '')
  const [nationalId, setNationalId] = useState('')
  const [hasNationalId, setHasNationalId] = useState(initial?.childHasNationalId ?? false)
  const [wantClearNationalId, setWantClearNationalId] = useState(false)
  const [nhiNo, setNhiNo] = useState('')
  const [hasNhiNo, setHasNhiNo] = useState(initial?.childHasNhiNo ?? false)
  const [wantClearNhiNo, setWantClearNhiNo] = useState(false)
  const initBlood = (initial?.childBloodType as 'A' | 'B' | 'O' | 'AB' | null | undefined) ?? null
  const [bloodType, setBloodType] = useState<'A' | 'B' | 'O' | 'AB' | null>(initBlood)
  const [hospital, setHospital] = useState(initial?.childHospital ?? '')
  const [heightCm, setHeightCm] = useState(initial?.childHeightCm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(initial?.childWeightG ? (initial.childWeightG / 1000).toFixed(1) : '')

  const {
    isEdit, name, setName, notes, setNotes, pending, error,
    nameInputRef, ts, performDelete, runMutation,
  } = useAssetSheetCommon({
    open, initial, onClose, onMutated,
    resetDomain: () => {
      setNickname(initial?.childNickname ?? '')
      setGender((initial?.childGender === 'male' || initial?.childGender === 'female') ? initial.childGender : null)
      setBirthday(initial?.childBirthday ?? '')
      setNationalId('')
      setHasNationalId(initial?.childHasNationalId ?? false)
      setWantClearNationalId(false)
      setNhiNo('')
      setHasNhiNo(initial?.childHasNhiNo ?? false)
      setWantClearNhiNo(false)
      setBloodType((initial?.childBloodType as 'A' | 'B' | 'O' | 'AB' | null | undefined) ?? null)
      setHospital(initial?.childHospital ?? '')
      setHeightCm(initial?.childHeightCm?.toString() ?? '')
      setWeightKg(initial?.childWeightG ? (initial.childWeightG / 1000).toFixed(1) : '')
    },
  })

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    // PII trinary on edit:
    //   typed string → encrypt + set
    //   blank input + 「清除」 pressed → null (clear column)
    //   blank input alone → undefined (omit; keep existing encrypted value)
    // On create there is no existing column, so blank just submits null.
    const piiNationalId: string | null | undefined =
      nationalId.trim().length > 0
        ? nationalId.trim()
        : (isEdit && wantClearNationalId
            ? null
            : (isEdit ? undefined : null))
    const piiNhiNo: string | null | undefined =
      nhiNo.trim().length > 0
        ? nhiNo.trim()
        : (isEdit && wantClearNhiNo
            ? null
            : (isEdit ? undefined : null))
    const payload = {
      name: name.trim(),
      nickname: nickname.trim() || null,
      gender,
      birthday: birthday || null,
      nationalId: piiNationalId,
      nhiNo: piiNhiNo,
      bloodType,
      hospital: hospital.trim() || null,
      heightCm: heightCm ? parseInt(heightCm, 10) : null,
      weightG: weightKg ? Math.round(parseFloat(weightKg) * 1000) : null,
      notes: notes.trim() || null,
    }
    runMutation(
      async () => {
        if (isEdit) {
          await editChild({ id: initial!.id, ...payload })
        } else {
          await createChild(payload)
        }
      },
      () => { onMutated?.('saved'); onClose() },
    )
  }

  const title = isEdit ? ts.titleEdit.replace('{type}', ts.type.child) : ts.titleNew

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
        placeholder={ts.name.placeholderChild}
      />

      <Field label={ts.child.nickname}>
        {id => (
          <input id={id} value={nickname} onChange={e => setNickname(e.target.value.slice(0, 20))}
            placeholder={ts.child.nicknamePlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }} />
        )}
      </Field>

      <Field label={ts.child.gender}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--toggle-segment-track)' }}>
          {([{v: 'male' as const, label: ts.child.genderMale}, {v: 'female' as const, label: ts.child.genderFemale}]).map(o => {
            const sel = gender === o.v
            return (
              <button key={o.v} type="button" onClick={() => setGender(o.v)}
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

      <Field label={ts.child.birthday}>
        {id => (
          <input id={id} value={birthday} onChange={e => setBirthday(e.target.value)}
            type="date" className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }} />
        )}
      </Field>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.child.sectionId}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.child.nationalId}>
        {id => (
        <div className="flex items-center gap-2">
          <input
            id={id}
            value={nationalId}
            onChange={e => {
              setNationalId(e.target.value.slice(0, 20))
              // Typing voids any pending clear — the user clearly wants
              // to set a new value, not clear.
              if (wantClearNationalId) setWantClearNationalId(false)
            }}
            placeholder={
              wantClearNationalId
                ? ts.child.pendingClearHint
                : (isEdit && hasNationalId
                    ? ts.child.encryptedHint
                    : ts.child.nationalIdPlaceholder)
            }
            className="flex-1 bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
          />
          {isEdit && hasNationalId && !wantClearNationalId && nationalId.trim() === '' && (
            <button
              type="button"
              onClick={() => setWantClearNationalId(true)}
              className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
              style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
            >
              {ts.child.clear}
            </button>
          )}
          {isEdit && wantClearNationalId && (
            <button
              type="button"
              onClick={() => setWantClearNationalId(false)}
              className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
              style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
            >
              {ts.child.cancelClear}
            </button>
          )}
        </div>
        )}
      </Field>

      <Field label={ts.child.nhiNo}>
        {id => (
        <div className="flex items-center gap-2">
          <input
            id={id}
            value={nhiNo}
            onChange={e => {
              setNhiNo(formatNhi(e.target.value))
              if (wantClearNhiNo) setWantClearNhiNo(false)
            }}
            inputMode="numeric"
            maxLength={NHI_MAX_LENGTH}
            placeholder={
              wantClearNhiNo
                ? ts.child.pendingClearHint
                : (isEdit && hasNhiNo
                    ? ts.child.encryptedHint
                    : ts.child.nhiNoPlaceholder)
            }
            className="flex-1 bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
          />
          {isEdit && hasNhiNo && !wantClearNhiNo && nhiNo.trim() === '' && (
            <button
              type="button"
              onClick={() => setWantClearNhiNo(true)}
              className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
              style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
            >
              {ts.child.clear}
            </button>
          )}
          {isEdit && wantClearNhiNo && (
            <button
              type="button"
              onClick={() => setWantClearNhiNo(false)}
              className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
              style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
            >
              {ts.child.cancelClear}
            </button>
          )}
        </div>
        )}
      </Field>

      <Field label={ts.child.bloodType}>
        <div className="flex gap-1.5">
          {(['A', 'B', 'O', 'AB'] as const).map(b => (
            <button key={b} type="button" onClick={() => setBloodType(b)}
              className="flex-1 h-9 rounded-[10px] text-label font-semibold"
              style={{
                border: bloodType === b ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: bloodType === b ? 'rgba(58,36,25,0.04)' : '#fff',
                color: bloodType === b ? 'var(--ink)' : 'var(--ink-2)',
                fontFamily: 'var(--font-numeric)',
              }}>{b}</button>
          ))}
        </div>
      </Field>

      <Field label={ts.child.hospital}>
        {id => (
          <input id={id} value={hospital} onChange={e => setHospital(e.target.value.slice(0, 32))}
            placeholder={ts.child.hospitalPlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }} />
        )}
      </Field>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.child.sectionBody}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Field label={ts.child.height}>
            {id => (
              <>
                <input id={id} value={heightCm} onChange={e => setHeightCm(e.target.value)}
                  type="number" inputMode="numeric" placeholder={ts.child.heightPlaceholder}
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>cm</span>
              </>
            )}
          </Field>
        </div>
        <div className="flex-1">
          <Field label={ts.child.weight}>
            {id => (
              <>
                <input id={id} value={weightKg} onChange={e => setWeightKg(e.target.value)}
                  type="number" inputMode="decimal" placeholder={ts.child.weightPlaceholder}
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>kg</span>
              </>
            )}
          </Field>
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
