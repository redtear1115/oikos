'use client'

import { useState } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import {
  createInsurance,
  editInsurance,
  getCarAssets,
  getChildAssets,
} from '@/actions/asset'
import type { CarAsset, ChildAsset } from '@/actions/asset'
import { TextInput } from '@/components/ui/TextInput'
import { Field } from './shared/Field'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import { useAssetSheetCommon } from './shared/useAssetSheetCommon'
import type { AssetSheetInitial, BodySharedProps } from './types'

export type InsuranceInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'insKind' | 'insInsured' | 'insInsuredChildId' | 'insInsuredUserId' | 'insPolicyHolderUserId'
  | 'insInsurer' | 'insPolicyNo' | 'insAnnualPremium' | 'insSumInsured'
  | 'insPayCycle' | 'insStartsAt' | 'insEndsAt' | 'insTermYears'
  | 'insVehicleId' | 'insExpectedMaturityAmount' | 'insAccountValue'
>

interface Props extends BodySharedProps {
  initial?: InsuranceInitial
}

export function InsuranceSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  // #142 — 要保人 is always a group member (or null for legacy/unset rows).
  // Defaults to viewer.id on create. In solo mode the toggle is hidden because
  // there's only one possible value.
  const { viewer, partner } = useMember()

  const [kind, setKind] = useState(initial?.insKind ?? 'medical')
  const [insured, setInsured] = useState(initial?.insInsured ?? '')
  // #167 + #237 — 被保人 has three mutually-exclusive sources:
  //   - Child 愛物 link (insuredChildId) — pick a 孩子 愛物 in the group
  //   - Group member link (insuredUserId) — 自己 or 對方 via Profiles FK
  //   - Freeform text (insured) — relatives outside the group, etc.
  // Picking any one clears the other two so the DB never carries stale data
  // for the losing branches. The action layer enforces the same precedence
  // (child > member > text) defensively.
  const [insuredChildId, setInsuredChildId] = useState<string | null>(initial?.insInsuredChildId ?? null)
  const [insuredUserId, setInsuredUserId] = useState<string | null>(initial?.insInsuredUserId ?? null)
  // #142 — Legacy rows (created before 0032) have NULL policy_holder.
  // Default to viewer on prefill so editing fills it in gracefully, same
  // as the create flow. User can still flip to partner via the toggle.
  const [policyHolderUserId, setPolicyHolderUserId] = useState<string | null>(initial?.insPolicyHolderUserId ?? viewer.id)
  const [insurer, setInsurer] = useState(initial?.insInsurer ?? '')
  const [policyNo, setPolicyNo] = useState(initial?.insPolicyNo ?? '')
  const [premium, setPremium] = useState(initial?.insAnnualPremium?.toString() ?? '')
  const [sumInsured, setSumInsured] = useState(initial?.insSumInsured?.toString() ?? '')
  const [payCycle, setPayCycle] = useState(initial?.insPayCycle ?? 'annual')
  const [startsAt, setStartsAt] = useState(initial?.insStartsAt ?? '')
  const [endsAt, setEndsAt] = useState(initial?.insEndsAt ?? '')
  const [termYears, setTermYears] = useState(initial?.insTermYears?.toString() ?? '')
  const [vehicleId, setVehicleId] = useState<string | null>(initial?.insVehicleId ?? null)
  const [expectedMaturityAmount, setExpectedMaturityAmount] = useState(initial?.insExpectedMaturityAmount?.toString() ?? '')
  // #166 — only meaningful for kind === 'savings'; cleared on save when kind switches.
  const [accountValue, setAccountValue] = useState(initial?.insAccountValue?.toString() ?? '')
  const [carAssets, setCarAssets] = useState<CarAsset[]>([])
  const [childAssets, setChildAssets] = useState<ChildAsset[]>([])

  const {
    isEdit, name, setName, notes, setNotes, pending, error,
    nameInputRef, t, ts, performDelete, runMutation,
  } = useAssetSheetCommon({
    open, initial, onClose, onMutated,
    resetDomain: () => {
      setKind(initial?.insKind ?? 'medical')
      setInsured(initial?.insInsured ?? '')
      setInsuredChildId(initial?.insInsuredChildId ?? null)
      setInsuredUserId(initial?.insInsuredUserId ?? null)
      setPolicyHolderUserId(initial?.insPolicyHolderUserId ?? viewer.id)
      setInsurer(initial?.insInsurer ?? '')
      setPolicyNo(initial?.insPolicyNo ?? '')
      setPremium(initial?.insAnnualPremium?.toString() ?? '')
      setSumInsured(initial?.insSumInsured?.toString() ?? '')
      setPayCycle(initial?.insPayCycle ?? 'annual')
      setStartsAt(initial?.insStartsAt ?? '')
      setEndsAt(initial?.insEndsAt ?? '')
      setTermYears(initial?.insTermYears?.toString() ?? '')
      setVehicleId(initial?.insVehicleId ?? null)
      setExpectedMaturityAmount(initial?.insExpectedMaturityAmount?.toString() ?? '')
      setAccountValue(initial?.insAccountValue?.toString() ?? '')
      // Data loads — only fire on open, not every render. Errors swallowed so
      // a network blip doesn't prevent the sheet from opening (lists fall back
      // to empty arrays from initial state).
      getCarAssets().then(setCarAssets).catch(() => {})
      getChildAssets().then(setChildAssets).catch(() => {})
    },
  })

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const payload = {
      name: name.trim(),
      kind: kind || null,
      // #167 + #237 — three mutually-exclusive insured sources. UI keeps
      // them mutex, but the action layer also enforces precedence
      // (child > member > text) so we just send the picker state as-is.
      insured: insured.trim() || null,
      insuredChildId,
      insuredUserId,
      policyHolderUserId,
      insurer: insurer.trim() || null,
      policyNo: policyNo.trim() || null,
      annualPremium: premium ? parseInt(premium, 10) : null,
      sumInsured: sumInsured ? parseInt(sumInsured, 10) : null,
      payCycle: payCycle || null,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      termYears: termYears ? parseInt(termYears, 10) : null,
      vehicleId: vehicleId || null,
      expectedMaturityAmount:
        kind === 'savings' && expectedMaturityAmount
          ? parseInt(expectedMaturityAmount, 10)
          : null,
      accountValue:
        kind === 'savings' && accountValue
          ? parseInt(accountValue, 10)
          : null,
      notes: notes.trim() || null,
    }
    runMutation(
      async () => {
        if (isEdit) {
          await editInsurance({ id: initial!.id, ...payload })
        } else {
          await createInsurance(payload)
        }
      },
      () => { onMutated?.('saved'); onClose() },
    )
  }

  const title = isEdit ? ts.titleEdit.replace('{type}', ts.type.insurance) : ts.titleNew

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
        placeholder={ts.name.placeholderInsurance}
      />

      <Field label={ts.insurance.kind}>
        <div className="flex flex-wrap gap-1.5">
          {[{v:'medical',label:ts.insurance.kindMedical},{v:'life',label:ts.insurance.kindLife},{v:'accident',label:ts.insurance.kindAccident},{v:'cancer',label:ts.insurance.kindCancer},{v:'illness',label:ts.insurance.kindIllness},{v:'car',label:ts.insurance.kindCar},{v:'savings',label:ts.insurance.kindSavings}].map(o => (
            <button key={o.v} type="button" onClick={() => setKind(o.v)}
              className="h-chip px-3.5 rounded-chip text-label"
              style={{
                border: kind === o.v ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: kind === o.v ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                color: kind === o.v ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: kind === o.v ? 600 : 500,
              }}>{o.label}</button>
          ))}
        </div>
      </Field>

      {/* #142 — 要保人 (policy holder). Always a group member, so bound
          to Profile via FK. Toggle is hidden in solo mode (only one
          possible value; form defaults to viewer.id). */}
      {partner && (
        <Field label={ts.insurance.policyHolder}>
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--toggle-segment-track)' }}>
            {[
              { id: viewer.id, label: t.common.me },
              { id: partner.id, label: partner.displayName ?? t.common.partner },
            ].map(opt => {
              const active = policyHolderUserId === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPolicyHolderUserId(opt.id)}
                  className={`oik-segment flex-1 h-9 rounded-lg text-label font-medium ${
                    active ? 'font-semibold' : ''
                  }`}
                  style={{
                    background: active ? 'var(--toggle-segment-thumb)' : 'transparent',
                    color: active ? 'var(--ink)' : 'var(--ink-2)',
                    boxShadow: active ? 'var(--toggle-segment-thumb-shadow)' : 'none',
                    transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {/* #167 + #237 — 被保人 picker. Three mutually-exclusive sources:
          group member (自己 / 對方), Child 愛物, or freeform text. The chip
          row always renders since 「我」is always an option; 「對方」 is hidden
          in solo mode. Picking a member or child clears the freeform text;
          picking 自行輸入 reveals the text input. */}
      <Field label={ts.insurance.insured}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setInsuredUserId(viewer.id)
                setInsuredChildId(null)
                setInsured('')
              }}
              className="h-chip px-3.5 rounded-chip text-label"
              style={{
                border: insuredUserId === viewer.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: insuredUserId === viewer.id ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                color: insuredUserId === viewer.id ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: insuredUserId === viewer.id ? 600 : 500,
              }}
            >
              {t.common.me}
            </button>
            {partner && (
              <button
                type="button"
                onClick={() => {
                  setInsuredUserId(partner.id)
                  setInsuredChildId(null)
                  setInsured('')
                }}
                className="h-chip px-3.5 rounded-chip text-label"
                style={{
                  border: insuredUserId === partner.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                  background: insuredUserId === partner.id ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                  color: insuredUserId === partner.id ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: insuredUserId === partner.id ? 600 : 500,
                }}
              >
                {partner.displayName ?? t.common.partner}
              </button>
            )}
            {childAssets.map(child => (
              <button
                key={child.id}
                type="button"
                onClick={() => {
                  setInsuredChildId(child.id)
                  setInsuredUserId(null)
                  setInsured('')
                }}
                className="h-chip px-3.5 rounded-chip text-label"
                style={{
                  border: insuredChildId === child.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                  background: insuredChildId === child.id ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                  color: insuredChildId === child.id ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: insuredChildId === child.id ? 600 : 500,
                }}
              >
                {child.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setInsuredUserId(null)
                setInsuredChildId(null)
              }}
              className="h-chip px-3.5 rounded-chip text-label"
              style={{
                border: insuredUserId === null && insuredChildId === null ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: insuredUserId === null && insuredChildId === null ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                color: insuredUserId === null && insuredChildId === null ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: insuredUserId === null && insuredChildId === null ? 600 : 500,
              }}
            >
              {ts.insurance.insuredFreeform}
            </button>
          </div>
          {insuredUserId === null && insuredChildId === null && (
            <TextInput value={insured} onChange={e => setInsured(e.target.value.slice(0, 32))}
              placeholder={ts.insurance.insuredPlaceholder} />
          )}
        </div>
      </Field>

      <Field label={ts.insurance.insurer}>
        {id => (
          <TextInput id={id} value={insurer} onChange={e => setInsurer(e.target.value.slice(0, 32))}
            placeholder={ts.insurance.insurerPlaceholder} />
        )}
      </Field>

      <Field label={ts.insurance.policyNo}>
        {id => (
          <TextInput id={id} value={policyNo} onChange={e => setPolicyNo(e.target.value.slice(0, 32))}
            placeholder={ts.insurance.policyNoPlaceholder} style={{ fontFamily: 'var(--font-numeric)' }} />
        )}
      </Field>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.insurance.sectionPremium}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.insurance.annualPremium}>
        {id => (
          <TextInput id={id} value={premium} onChange={e => setPremium(e.target.value)}
            type="number" inputMode="numeric" placeholder={ts.insurance.annualPremiumPlaceholder}
            rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>} />
        )}
      </Field>

      <Field label={ts.insurance.sumInsured}>
        {id => (
          <TextInput id={id} value={sumInsured} onChange={e => setSumInsured(e.target.value)}
            type="number" inputMode="numeric" placeholder={ts.insurance.sumInsuredPlaceholder}
            rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>} />
        )}
      </Field>

      {kind === 'savings' && (
        <Field label={ts.insurance.expectedMaturityAmount}>
          {id => (
            <TextInput
              id={id}
              value={expectedMaturityAmount}
              onChange={e => setExpectedMaturityAmount(e.target.value)}
              type="number"
              inputMode="numeric"
              placeholder={ts.insurance.expectedMaturityAmountPlaceholder}
              rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>}
            />
          )}
        </Field>
      )}

      {kind === 'savings' && (
        <Field label={ts.insurance.accountValue}>
          {id => (
            <TextInput
              id={id}
              value={accountValue}
              onChange={e => setAccountValue(e.target.value)}
              type="number"
              inputMode="numeric"
              placeholder={ts.insurance.accountValuePlaceholder}
              rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>}
            />
          )}
        </Field>
      )}

      <Field label={ts.insurance.payCycle}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--toggle-segment-track)' }}>
          {([{v:'annual',label:ts.insurance.payCycleAnnual},{v:'semi',label:ts.insurance.payCycleSemi},{v:'quarterly',label:ts.insurance.payCycleQuarterly},{v:'monthly',label:ts.insurance.payCycleMonthly}]).map(o => {
            const sel = payCycle === o.v
            return (
              <button key={o.v} type="button" onClick={() => setPayCycle(o.v)}
                className="oik-segment flex-1 h-8 rounded-[9px] text-xs font-medium"
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

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.insurance.sectionContract}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.insurance.startsAt}>
        {id => (
          <TextInput id={id} value={startsAt} onChange={e => setStartsAt(e.target.value)} type="date" />
        )}
      </Field>

      <Field label={ts.insurance.endsAt}>
        {id => (
          <TextInput id={id} value={endsAt} onChange={e => setEndsAt(e.target.value)} type="date" />
        )}
      </Field>

      <Field label={ts.insurance.termYears}>
        {id => (
          <TextInput id={id} value={termYears} onChange={e => setTermYears(e.target.value)}
            type="number" inputMode="numeric" placeholder={ts.insurance.termYearsPlaceholder}
            rightAddon={<span className="text-xs" style={{ color: 'var(--ink-3)' }}>{ts.insurance.termYearsSuffix}</span>} />
        )}
      </Field>

      {carAssets.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-2 px-1">
            <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.insurance.sectionLinkedVehicle}</div>
            <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
          </div>
          <Field label={ts.insurance.linkedVehicle}>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setVehicleId(null)}
                className="h-chip px-3.5 rounded-chip text-label"
                style={{
                  border: vehicleId === null ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                  background: vehicleId === null ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                  color: vehicleId === null ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: vehicleId === null ? 600 : 500,
                }}
              >
                {ts.insurance.noLink}
              </button>
              {carAssets.map(car => (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => setVehicleId(car.id)}
                  className="h-chip px-3.5 rounded-chip text-label"
                  style={{
                    border: vehicleId === car.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                    background: vehicleId === car.id ? 'rgba(58,36,25,0.04)' : 'var(--surface)',
                    color: vehicleId === car.id ? 'var(--ink)' : 'var(--ink-2)',
                    fontWeight: vehicleId === car.id ? 600 : 500,
                  }}
                >
                  {car.name}{car.plate ? ` · ${car.plate}` : ''}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

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
