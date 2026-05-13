'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import {
  createInsurance,
  editInsurance,
  softDeleteAsset,
  getCarAssets,
  getChildAssets,
} from '@/actions/asset'
import type { CarAsset, ChildAsset } from '@/actions/asset'
import { Field } from './shared/Field'
import { NameField } from './shared/NameField'
import { NotesField } from './shared/NotesField'
import { SheetShell } from './shared/SheetShell'
import { DeleteConfirmFlow } from './shared/DeleteConfirmFlow'
import type { AssetSheetInitial, BodySharedProps } from './types'

export type InsuranceInitial = Pick<
  AssetSheetInitial,
  | 'id' | 'name' | 'notes'
  | 'insKind' | 'insInsured' | 'insInsuredChildId' | 'insPolicyHolderUserId'
  | 'insInsurer' | 'insPolicyNo' | 'insAnnualPremium' | 'insSumInsured'
  | 'insPayCycle' | 'insStartsAt' | 'insEndsAt' | 'insTermYears'
  | 'insVehicleId' | 'insExpectedMaturityAmount' | 'insAccountValue'
>

interface Props extends BodySharedProps {
  initial?: InsuranceInitial
}

export function InsuranceSheetBody({ open, onClose, onMutated, typePickerSlot, initial }: Props) {
  const isEdit = !!initial
  const t = useTranslations()
  const ts = t.assetSheet
  // #142 — 要保人 is always a group member (or null for legacy/unset rows).
  // Defaults to viewer.id on create. In solo mode the toggle is hidden because
  // there's only one possible value.
  const { viewer, partner } = useMember()

  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState(initial?.insKind ?? 'medical')
  const [insured, setInsured] = useState(initial?.insInsured ?? '')
  // #167 — 被保人 can also link to a Child 愛物 in the group. Mutually
  // exclusive with the freeform `insured` text: setting one clears the
  // other so the DB stays consistent with the insured_type discriminator.
  const [insuredChildId, setInsuredChildId] = useState<string | null>(initial?.insInsuredChildId ?? null)
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
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [carAssets, setCarAssets] = useState<CarAsset[]>([])
  const [childAssets, setChildAssets] = useState<ChildAsset[]>([])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setKind(initial?.insKind ?? 'medical')
    setInsured(initial?.insInsured ?? '')
    setInsuredChildId(initial?.insInsuredChildId ?? null)
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
    setNotes(initial?.notes ?? '')
    setError('')
    getCarAssets().then(setCarAssets).catch(() => {})
    getChildAssets().then(setChildAssets).catch(() => {})
    const id = setTimeout(() => nameInputRef.current?.focus(), 350)
    return () => clearTimeout(id)
  }, [open, initial, viewer.id])

  const canSave = name.trim() !== '' && !pending

  const handleSave = () => {
    const notesPayload = notes.trim() || null
    startTransition(async () => {
      try {
        const payload = {
          name: name.trim(),
          kind: kind || null,
          // #167 — when a Child 愛物 is linked, the action layer flips
          // `insured_type` to 'child' and ignores `insured` text. Send both
          // so the action sees the picker state; the action decides which
          // wins.
          insured: insured.trim() || null,
          insuredChildId,
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
          notes: notesPayload,
        }
        if (isEdit) {
          await editInsurance({ id: initial!.id, ...payload })
        } else {
          await createInsurance(payload)
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
              className="h-[34px] px-[14px] rounded-[10px] text-label"
              style={{
                border: kind === o.v ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                background: kind === o.v ? 'rgba(58,36,25,0.04)' : '#fff',
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
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(58,36,25,0.05)' }}>
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
                  className={`flex-1 h-9 rounded-lg text-label font-medium transition-colors ${
                    active
                      ? 'bg-white text-[var(--ink)] font-semibold shadow-sm'
                      : 'bg-transparent text-[var(--ink-2)]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {/* #167 — 被保人 can link to a Child 愛物 in the group, or stay
          as freeform text (relatives outside the group, self, etc.).
          When at least one child exists in the group, show a chip
          picker above the text input: picking a child links and
          blanks the text; picking 自行輸入 (or just typing) clears
          the link. */}
      <Field label={ts.insurance.insured}>
        <div className="flex flex-col gap-2">
          {childAssets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setInsuredChildId(null)}
                className="h-[34px] px-[14px] rounded-[10px] text-label"
                style={{
                  border: insuredChildId === null ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                  background: insuredChildId === null ? 'rgba(58,36,25,0.04)' : '#fff',
                  color: insuredChildId === null ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: insuredChildId === null ? 600 : 500,
                }}
              >
                {ts.insurance.insuredFreeform}
              </button>
              {childAssets.map(child => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => {
                    setInsuredChildId(child.id)
                    setInsured('')
                  }}
                  className="h-[34px] px-[14px] rounded-[10px] text-label"
                  style={{
                    border: insuredChildId === child.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                    background: insuredChildId === child.id ? 'rgba(58,36,25,0.04)' : '#fff',
                    color: insuredChildId === child.id ? 'var(--ink)' : 'var(--ink-2)',
                    fontWeight: insuredChildId === child.id ? 600 : 500,
                  }}
                >
                  {child.name}
                </button>
              ))}
            </div>
          )}
          {insuredChildId === null && (
            <input value={insured} onChange={e => setInsured(e.target.value.slice(0, 32))}
              placeholder={ts.insurance.insuredPlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)' }} />
          )}
        </div>
      </Field>

      <Field label={ts.insurance.insurer}>
        <input value={insurer} onChange={e => setInsurer(e.target.value.slice(0, 32))}
          placeholder={ts.insurance.insurerPlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }} />
      </Field>

      <Field label={ts.insurance.policyNo}>
        <input value={policyNo} onChange={e => setPolicyNo(e.target.value.slice(0, 32))}
          placeholder={ts.insurance.policyNoPlaceholder} className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }} />
      </Field>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.insurance.sectionPremium}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.insurance.annualPremium}>
        <input value={premium} onChange={e => setPremium(e.target.value)}
          type="number" inputMode="numeric" placeholder={ts.insurance.annualPremiumPlaceholder}
          className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }} />
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
      </Field>

      <Field label={ts.insurance.sumInsured}>
        <input value={sumInsured} onChange={e => setSumInsured(e.target.value)}
          type="number" inputMode="numeric" placeholder={ts.insurance.sumInsuredPlaceholder}
          className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }} />
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
      </Field>

      {kind === 'savings' && (
        <Field label={ts.insurance.expectedMaturityAmount}>
          <input
            value={expectedMaturityAmount}
            onChange={e => setExpectedMaturityAmount(e.target.value)}
            type="number"
            inputMode="numeric"
            placeholder={ts.insurance.expectedMaturityAmountPlaceholder}
            className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
        </Field>
      )}

      {kind === 'savings' && (
        <Field label={ts.insurance.accountValue}>
          <input
            value={accountValue}
            onChange={e => setAccountValue(e.target.value)}
            type="number"
            inputMode="numeric"
            placeholder={ts.insurance.accountValuePlaceholder}
            className="w-full bg-transparent border-0 outline-none text-base"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
        </Field>
      )}

      <Field label={ts.insurance.payCycle}>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(58,36,25,0.05)' }}>
          {([{v:'annual',label:ts.insurance.payCycleAnnual},{v:'semi',label:ts.insurance.payCycleSemi},{v:'quarterly',label:ts.insurance.payCycleQuarterly},{v:'monthly',label:ts.insurance.payCycleMonthly}]).map(o => (
            <button key={o.v} type="button" onClick={() => setPayCycle(o.v)}
              className="flex-1 h-8 rounded-[9px] text-xs font-medium"
              style={{
                border: 'none',
                background: payCycle === o.v ? '#fff' : 'transparent',
                color: payCycle === o.v ? 'var(--ink)' : 'var(--ink-2)',
                boxShadow: payCycle === o.v ? '0 1px 3px rgba(58,36,25,0.10)' : 'none',
              }}>{o.label}</button>
          ))}
        </div>
      </Field>

      <div className="flex items-center gap-2 mt-2 px-1">
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>{ts.insurance.sectionContract}</div>
        <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
      </div>

      <Field label={ts.insurance.startsAt}>
        <input value={startsAt} onChange={e => setStartsAt(e.target.value)}
          type="date" className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }} />
      </Field>

      <Field label={ts.insurance.endsAt}>
        <input value={endsAt} onChange={e => setEndsAt(e.target.value)}
          type="date" className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }} />
      </Field>

      <Field label={ts.insurance.termYears}>
        <input value={termYears} onChange={e => setTermYears(e.target.value)}
          type="number" inputMode="numeric" placeholder={ts.insurance.termYearsPlaceholder}
          className="w-full bg-transparent border-0 outline-none text-base"
          style={{ color: 'var(--ink)' }} />
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{ts.insurance.termYearsSuffix}</span>
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
                className="h-[34px] px-[14px] rounded-[10px] text-label"
                style={{
                  border: vehicleId === null ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                  background: vehicleId === null ? 'rgba(58,36,25,0.04)' : '#fff',
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
                  className="h-[34px] px-[14px] rounded-[10px] text-label"
                  style={{
                    border: vehicleId === car.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                    background: vehicleId === car.id ? 'rgba(58,36,25,0.04)' : '#fff',
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
