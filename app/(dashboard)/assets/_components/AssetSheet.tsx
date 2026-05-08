'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { FuelTypeButtonGroup } from '@/app/(dashboard)/_components/FuelTypeButtonGroup'
import { PrimaryUserToggle } from '@/app/(dashboard)/_components/PrimaryUserToggle'
import { localTodayISO, dateLabel } from '@/lib/local-date'
import { createCar, editCar, editLifeEntity, softDeleteAsset, createChild, editChild, createPet, editPet, createPlant, editPlant, createInsurance, editInsurance, createHouse, editHouse, getCarAssets } from '@/actions/asset'
import type { EditChildInput, EditPetInput, EditInsuranceInput, CarAsset } from '@/actions/asset'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'

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

export interface AssetSheetInitial {
  id: string
  type: 'car' | 'child' | 'pet' | 'plant' | 'house' | 'insurance'
  name: string
  // car-only fields
  plate?: string
  purchasedAt?: string | null
  purchasePrice?: number | null
  fuelType?: '92' | '95' | '98' | 'diesel'
  primaryUserId?: string | null
  // extended car fields
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
  // Child-specific. nationalId / nhiNo are encrypted at rest (see
  // actions/asset.ts createChild/editChild/revealChildPii); the form never
  // receives plaintext, only the has-value bools so it can show 「清除」.
  childNickname?: string | null
  childGender?: 'male' | 'female' | 'other' | null
  childBirthday?: string | null
  childHasNationalId?: boolean
  childHasNhiNo?: boolean
  childBloodType?: string | null
  childHospital?: string | null
  childHeightCm?: number | null
  childWeightG?: number | null
  // Pet-specific
  petSpecies?: string | null
  petBreed?: string | null
  petSex?: string | null
  petBirthDate?: string | null
  petAdoptedDate?: string | null
  petPurchaseCost?: number | null
  petWeightG?: number | null
  petChipNo?: string | null
  petVet?: string | null
  // Plant-specific
  plantSpecies?: string | null
  plantLocation?: string | null
  plantSproutedAt?: string | null
  plantCost?: number | null
  plantWaterEvery?: number | null
  // Insurance-specific
  insKind?: string | null
  insInsured?: string | null
  insInsurer?: string | null
  insPolicyNo?: string | null
  insAnnualPremium?: number | null
  insSumInsured?: number | null
  insPayCycle?: string | null
  insStartsAt?: string | null
  insEndsAt?: string | null
  insTermYears?: number | null
  insVehicleId?: string | null
  insExpectedMaturityAmount?: number | null
  // House-specific
  houseAddress?: string | null
  housePurchasedAt?: string | null
  housePurchasePrice?: number | null
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AssetSheetInitial
  onMutated?: (kind: 'saved' | 'deleted') => void
}

type PickerType = 'car' | 'child' | 'pet' | 'plant' | 'insurance' | 'house'

// Primary tiles always visible (4 + 1 「更多」 toggle = 5 cells in one row).
// Secondary tiles (房子 / 保險) reveal under 「更多」 to keep the row tidy as
// the type list grows. This avoids a wrapped 6-tile grid that pushes the form
// down when switching types.
const PRIMARY_TYPE_OPTIONS: { value: PickerType; label: string }[] = [
  { value: 'car',   label: '車' },
  { value: 'child', label: '孩子' },
  { value: 'pet',   label: '寵物' },
  { value: 'plant', label: '植物' },
]
const SECONDARY_TYPE_OPTIONS: { value: PickerType; label: string }[] = [
  { value: 'house',     label: '房子' },
  { value: 'insurance', label: '保險' },
]
const TYPE_OPTIONS = [...PRIMARY_TYPE_OPTIONS, ...SECONDARY_TYPE_OPTIONS]
const isSecondaryType = (t: PickerType) => SECONDARY_TYPE_OPTIONS.some(o => o.value === t)

export function AssetSheet({ open, onClose, initial, onMutated }: Props) {
  const isEdit = !!initial
  const [selectedType, setSelectedType] = useState<PickerType>('pet')
  const [name, setName] = useState('')
  // car-only fields
  const [plate, setPlate] = useState('')
  const [purchasedAt, setPurchasedAt] = useState<string | null>(null)
  const [purchasePrice, setPurchasePrice] = useState('')
  const [fuelType, setFuelType] = useState<'92' | '95' | '98' | 'diesel'>('95')
  const [primaryUserId, setPrimaryUserId] = useState<string | null>(null)
  // extended car fields
  const [color, setColor] = useState<string | null>(null)
  const [year, setYear] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [initialOdometer, setInitialOdometer] = useState('')
  // Child state. nationalId / nhiNo are special:
  //   - The form ALWAYS starts blank — we never receive plaintext from the
  //     server (stored encrypted). When `hasX` is true, an existing encrypted
  //     value lives on the server side; the user can leave the input blank
  //     (= keep) or hit the 「清除」 button (= explicitly null).
  //   - The "wantClear" flag is the cleared sentinel: when true, the value
  //     submitted is `null` (clear column). When false and the input is empty,
  //     the value submitted is `undefined` (keep existing). A non-empty input
  //     overrides both and submits a string (encrypt + set).
  const [childNickname, setChildNickname] = useState('')
  const [childGender, setChildGender] = useState<'male' | 'female' | null>(null)
  const [childBirthday, setChildBirthday] = useState('')
  const [childNationalId, setChildNationalId] = useState('')
  const [childHasNationalId, setChildHasNationalId] = useState(false)
  const [childWantClearNationalId, setChildWantClearNationalId] = useState(false)
  const [childNhiNo, setChildNhiNo] = useState('')
  const [childHasNhiNo, setChildHasNhiNo] = useState(false)
  const [childWantClearNhiNo, setChildWantClearNhiNo] = useState(false)
  const [childBloodType, setChildBloodType] = useState<'A' | 'B' | 'O' | 'AB' | null>(null)
  const [childHospital, setChildHospital] = useState('')
  const [childHeightCm, setChildHeightCm] = useState('')
  const [childWeightKg, setChildWeightKg] = useState('')
  // Pet state
  const [petSpecies, setPetSpecies] = useState('')
  const [petBreed, setPetBreed] = useState('')
  const [petSex, setPetSex] = useState<'male' | 'female' | 'unknown' | null>(null)
  const [petBirthDate, setPetBirthDate] = useState('')
  const [petAdoptedDate, setPetAdoptedDate] = useState('')
  const [petCost, setPetCost] = useState('')
  const [petWeightKg, setPetWeightKg] = useState('')
  const [petChipNo, setPetChipNo] = useState('')
  const [petVet, setPetVet] = useState('')
  // Plant state
  const [plantSpecies, setPlantSpecies] = useState('')
  const [plantLocation, setPlantLocation] = useState('')
  const [plantSproutedAt, setPlantSproutedAt] = useState('')
  const [plantCost, setPlantCost] = useState('')
  const [plantWaterEvery, setPlantWaterEvery] = useState<number | null>(7)
  // house-only fields
  const [houseAddress, setHouseAddress] = useState('')
  const [housePurchasedAt, setHousePurchasedAt] = useState('')
  const [housePurchasePrice, setHousePurchasePrice] = useState('')
  // Insurance state
  const [insKind, setInsKind] = useState('medical')
  const [insInsured, setInsInsured] = useState('')
  const [insInsurer, setInsInsurer] = useState('')
  const [insPolicyNo, setInsPolicyNo] = useState('')
  const [insPremium, setInsPremium] = useState('')
  const [insSumInsured, setInsSumInsured] = useState('')
  const [insPayCycle, setInsPayCycle] = useState('annual')
  const [insStartsAt, setInsStartsAt] = useState('')
  const [insEndsAt, setInsEndsAt] = useState('')
  const [insTermYears, setInsTermYears] = useState('')
  const [insVehicleId, setInsVehicleId] = useState<string | null>(null)
  const [insExpectedMaturityAmount, setInsExpectedMaturityAmount] = useState('')
  const [carAssets, setCarAssets] = useState<CarAsset[]>([])
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Whether the secondary tile row (房子 / 保險) is expanded under 「更多」.
  // Auto-true if the current selectedType is a secondary type so the user
  // can see what they picked without having to re-tap 更多.
  const [moreOpen, setMoreOpen] = useState(false)
  const showSecondaryRow = moreOpen || isSecondaryType(selectedType)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setSelectedType((initial.type as PickerType) ?? 'pet')
      setName(initial.name)
      setPlate(initial.plate ?? '')
      setPurchasedAt(initial.purchasedAt ?? null)
      setPurchasePrice(initial.purchasePrice ? String(initial.purchasePrice) : '')
      setFuelType(initial.fuelType ?? '95')
      setPrimaryUserId(initial.primaryUserId ?? null)
      setColor(initial.color ?? null)
      setYear(initial.year ? String(initial.year) : '')
      setBrand(initial.brand ?? '')
      setModel(initial.model ?? '')
      setInitialOdometer(initial.initialOdometer ? String(initial.initialOdometer) : '')
      if (initial.type === 'child') {
        setChildNickname(initial.childNickname ?? '')
        setChildGender((initial.childGender === 'male' || initial.childGender === 'female') ? initial.childGender : null)
        setChildBirthday(initial.childBirthday ?? '')
        // Always start PII inputs blank — we never receive plaintext.
        setChildNationalId('')
        setChildHasNationalId(initial.childHasNationalId ?? false)
        setChildWantClearNationalId(false)
        setChildNhiNo('')
        setChildHasNhiNo(initial.childHasNhiNo ?? false)
        setChildWantClearNhiNo(false)
        setChildBloodType((initial.childBloodType as 'A' | 'B' | 'O' | 'AB' | null) ?? null)
        setChildHospital(initial.childHospital ?? '')
        setChildHeightCm(initial.childHeightCm?.toString() ?? '')
        setChildWeightKg(initial.childWeightG ? (initial.childWeightG / 1000).toFixed(1) : '')
      }
      if (initial.type === 'pet') {
        setPetSpecies(initial.petSpecies ?? '')
        setPetBreed(initial.petBreed ?? '')
        setPetSex((initial.petSex === 'male' || initial.petSex === 'female' || initial.petSex === 'unknown') ? initial.petSex : null)
        setPetBirthDate(initial.petBirthDate ?? '')
        setPetAdoptedDate(initial.petAdoptedDate ?? '')
        setPetCost(initial.petPurchaseCost?.toString() ?? '')
        setPetWeightKg(initial.petWeightG ? (initial.petWeightG / 1000).toFixed(1) : '')
        setPetChipNo(initial.petChipNo ?? '')
        setPetVet(initial.petVet ?? '')
      }
      if (initial.type === 'plant') {
        setPlantSpecies(initial.plantSpecies ?? '')
        setPlantLocation(initial.plantLocation ?? '')
        setPlantSproutedAt(initial.plantSproutedAt ?? '')
        setPlantCost(initial.plantCost?.toString() ?? '')
        setPlantWaterEvery(initial.plantWaterEvery ?? 7)
      }
      if (initial.type === 'house') {
        setHouseAddress(initial.houseAddress ?? '')
        setHousePurchasedAt(initial.housePurchasedAt ?? '')
        setHousePurchasePrice(initial.housePurchasePrice?.toString() ?? '')
      }
      if (initial.type === 'insurance') {
        setInsKind(initial.insKind ?? 'medical')
        setInsInsured(initial.insInsured ?? '')
        setInsInsurer(initial.insInsurer ?? '')
        setInsPolicyNo(initial.insPolicyNo ?? '')
        setInsPremium(initial.insAnnualPremium?.toString() ?? '')
        setInsSumInsured(initial.insSumInsured?.toString() ?? '')
        setInsPayCycle(initial.insPayCycle ?? 'annual')
        setInsStartsAt(initial.insStartsAt ?? '')
        setInsEndsAt(initial.insEndsAt ?? '')
        setInsTermYears(initial.insTermYears?.toString() ?? '')
        setInsVehicleId(initial.insVehicleId ?? null)
        setInsExpectedMaturityAmount(initial.insExpectedMaturityAmount?.toString() ?? '')
        getCarAssets().then(setCarAssets).catch(() => {})
      }
    } else {
      setSelectedType('pet')
      setName('')
      setPlate('')
      setPurchasedAt(null)
      setPurchasePrice('')
      setFuelType('95')
      setPrimaryUserId(null)
      setColor(null)
      setYear('')
      setBrand('')
      setModel('')
      setInitialOdometer('')
      // Child resets
      setChildNickname('')
      setChildGender(null)
      setChildBirthday('')
      setChildNationalId('')
      setChildHasNationalId(false)
      setChildWantClearNationalId(false)
      setChildNhiNo('')
      setChildHasNhiNo(false)
      setChildWantClearNhiNo(false)
      setChildBloodType(null)
      setChildHospital('')
      setChildHeightCm('')
      setChildWeightKg('')
      // Pet resets
      setPetSpecies('')
      setPetBreed('')
      setPetSex(null)
      setPetBirthDate('')
      setPetAdoptedDate('')
      setPetCost('')
      setPetWeightKg('')
      setPetChipNo('')
      setPetVet('')
      // Plant resets
      setPlantSpecies('')
      setPlantLocation('')
      setPlantSproutedAt('')
      setPlantCost('')
      setPlantWaterEvery(7)
      // House resets
      setHouseAddress('')
      setHousePurchasedAt('')
      setHousePurchasePrice('')
      // Insurance resets
      setInsKind('medical')
      setInsInsured('')
      setInsInsurer('')
      setInsPolicyNo('')
      setInsPremium('')
      setInsSumInsured('')
      setInsPayCycle('annual')
      setInsStartsAt('')
      setInsEndsAt('')
      setInsTermYears('')
      setInsVehicleId(null)
      setInsExpectedMaturityAmount('')
    }
    setShowCal(false)
    setError('')
    const t = setTimeout(() => nameInputRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [open, initial])

  const isCar = selectedType === 'car'

  const canSave = isCar
    ? name.trim() !== '' && plate.trim() !== '' && !pending
    : name.trim() !== '' && !pending

  const handleSave = () => {
    startTransition(async () => {
      try {
        if (isCar) {
          const price = purchasePrice ? parseInt(purchasePrice, 10) : null
          if (isEdit) {
            await editCar({
              id: initial!.id,
              name: name.trim(),
              plate: plate.trim(),
              purchasedAt,
              purchasePrice: price,
              fuelType,
              primaryUserId,
              color,
              year: year ? parseInt(year, 10) : null,
              brand: brand.trim() || null,
              model: model.trim() || null,
              initialOdometer: initialOdometer ? parseInt(initialOdometer.replace(/,/g, ''), 10) : null,
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
            })
          }
        } else if (selectedType === 'child') {
          // PII trinary on edit:
          //   typed string → encrypt + set
          //   blank input + 「清除」 pressed → null (clear column)
          //   blank input alone → undefined (omit; keep existing encrypted value)
          // On create there is no existing column, so blank just submits null.
          const piiNationalId: string | null | undefined =
            childNationalId.trim().length > 0
              ? childNationalId.trim()
              : (isEdit && childWantClearNationalId
                  ? null
                  : (isEdit ? undefined : null))
          const piiNhiNo: string | null | undefined =
            childNhiNo.trim().length > 0
              ? childNhiNo.trim()
              : (isEdit && childWantClearNhiNo
                  ? null
                  : (isEdit ? undefined : null))
          const payload = {
            name: name.trim(),
            nickname: childNickname.trim() || null,
            gender: childGender,
            birthday: childBirthday || null,
            nationalId: piiNationalId,
            nhiNo: piiNhiNo,
            bloodType: childBloodType,
            hospital: childHospital.trim() || null,
            heightCm: childHeightCm ? parseInt(childHeightCm, 10) : null,
            weightG: childWeightKg ? Math.round(parseFloat(childWeightKg) * 1000) : null,
          }
          if (isEdit) {
            await editChild({ id: initial!.id, ...payload })
          } else {
            await createChild(payload)
          }
        } else if (selectedType === 'pet') {
          const payload = {
            name: name.trim(),
            species: petSpecies.trim() || null,
            breed: petBreed.trim() || null,
            sex: petSex,
            birthDate: petBirthDate || null,
            adoptedDate: petAdoptedDate || null,
            purchaseCost: petCost ? parseInt(petCost, 10) : null,
            weightG: petWeightKg ? Math.round(parseFloat(petWeightKg) * 1000) : null,
            chipNo: petChipNo.trim() || null,
            vet: petVet.trim() || null,
          }
          if (isEdit) {
            await editPet({ id: initial!.id, ...payload })
          } else {
            await createPet(payload)
          }
        } else if (selectedType === 'insurance') {
          const payload = {
            name: name.trim(),
            kind: insKind || null,
            insured: insInsured.trim() || null,
            insurer: insInsurer.trim() || null,
            policyNo: insPolicyNo.trim() || null,
            annualPremium: insPremium ? parseInt(insPremium, 10) : null,
            sumInsured: insSumInsured ? parseInt(insSumInsured, 10) : null,
            payCycle: insPayCycle || null,
            startsAt: insStartsAt || null,
            endsAt: insEndsAt || null,
            termYears: insTermYears ? parseInt(insTermYears, 10) : null,
            vehicleId: insVehicleId || null,
            expectedMaturityAmount:
              insKind === 'savings' && insExpectedMaturityAmount
                ? parseInt(insExpectedMaturityAmount, 10)
                : null,
          }
          if (isEdit) {
            await editInsurance({ id: initial!.id, ...payload })
          } else {
            await createInsurance(payload)
          }
        } else if (selectedType === 'plant') {
          const payload = {
            name: name.trim(),
            species: plantSpecies.trim() || null,
            location: plantLocation.trim() || null,
            sproutedAt: plantSproutedAt || null,
            cost: plantCost ? parseInt(plantCost, 10) : null,
            waterEvery: plantWaterEvery,
          }
          if (isEdit) {
            await editPlant({ id: initial!.id, ...payload })
          } else {
            await createPlant(payload)
          }
        } else if (selectedType === 'house') {
          const payload = {
            name: name.trim(),
            address: houseAddress.trim() || null,
            purchasedAt: housePurchasedAt || null,
            purchasePrice: housePurchasePrice ? parseInt(housePurchasePrice, 10) : null,
          }
          if (isEdit) {
            await editHouse({ id: initial!.id, ...payload })
          } else {
            await createHouse(payload)
          }
        } else {
          // fallback for unknown future types — edit name only
          if (isEdit) {
            await editLifeEntity({ id: initial!.id, name: name.trim() })
          }
        }
        onMutated?.('saved')
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const performDelete = () => {
    if (!isEdit) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteAsset(initial!.id)
        onMutated?.('deleted')
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  const typeLabel = TYPE_OPTIONS.find(o => o.value === selectedType)?.label ?? '愛物'
  const title = isEdit ? `編輯${typeLabel}` : '新增愛物'

  // Switching type clears all type-specific fields. Used by every tile click
  // (primary + secondary) so the dedup lives here, not duplicated per tile.
  const handleTypeChange = (t: PickerType) => {
    setSelectedType(t)
    setName('')
    setPlate('')
    setPurchasedAt(null)
    setPurchasePrice('')
    setColor(null)
    setYear('')
    setBrand('')
    setModel('')
    setInitialOdometer('')
    // Child resets
    setChildNickname('')
    setChildGender(null)
    setChildBirthday('')
    setChildNationalId('')
    setChildHasNationalId(false)
    setChildWantClearNationalId(false)
    setChildNhiNo('')
    setChildHasNhiNo(false)
    setChildWantClearNhiNo(false)
    setChildBloodType(null)
    setChildHospital('')
    setChildHeightCm('')
    setChildWeightKg('')
    // Pet resets
    setPetSpecies('')
    setPetBreed('')
    setPetSex(null)
    setPetBirthDate('')
    setPetAdoptedDate('')
    setPetCost('')
    setPetWeightKg('')
    setPetChipNo('')
    setPetVet('')
    // Plant resets
    setPlantSpecies('')
    setPlantLocation('')
    setPlantSproutedAt('')
    setPlantCost('')
    setPlantWaterEvery(7)
    // House resets
    setHouseAddress('')
    setHousePurchasedAt('')
    setHousePurchasePrice('')
    // Insurance resets
    setInsKind('medical')
    setInsInsured('')
    setInsInsurer('')
    setInsPolicyNo('')
    setInsPremium('')
    setInsSumInsured('')
    setInsPayCycle('annual')
    setInsStartsAt('')
    setInsEndsAt('')
    setInsTermYears('')
    setInsVehicleId(null)
    if (t === 'insurance') {
      getCarAssets().then(setCarAssets).catch(() => {})
    }
  }

  const namePlaceholder = isCar ? '例：我的車'
    : selectedType === 'child' ? '例：小明'
    : selectedType === 'pet' ? '例：米嚕'
    : selectedType === 'plant' ? '例：陽台上的植物們'
    : selectedType === 'house' ? '例：我們家'
    : '例：南山醫療終身險'

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed left-1/2 bottom-0 z-[100] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          // Fix the sheet height so toggling between types (long form like 車/保險 vs short like 植物/房子)
          // doesn't make the sheet jump. Inner content scrolls when needed.
          height: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose} className="bg-transparent border-0 text-body cursor-pointer p-1" style={{ color: 'var(--ink-2)' }}>
            取消
          </button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            {title}
          </div>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-transparent border-0 text-body font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{ color: canSave ? 'var(--accent)' : 'var(--ink-3)' }}
          >
            {pending ? '儲存中…' : '儲存'}
          </button>
        </div>

        <div className="overflow-auto flex-1 px-5 pt-2 pb-6">
          {/* Type picker — only when creating */}
          {!isEdit && (
            <div className="mb-4">
              <div className="text-xs mb-2 tracking-wide" style={{ color: 'var(--ink-3)' }}>類型</div>
              <div className="grid grid-cols-5 gap-2">
                {PRIMARY_TYPE_OPTIONS.map(opt => {
                  const sel = selectedType === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { handleTypeChange(opt.value); setMoreOpen(false) }}
                      className="flex flex-col items-center gap-1 py-3 rounded-[14px] border-0 cursor-pointer"
                      style={{
                        background: sel ? 'var(--accent)' : 'var(--surface)',
                        color: sel ? '#fff' : 'var(--ink-2)',
                      }}
                    >
                      <AssetIcon type={opt.value} size={20} color={sel ? '#fff' : 'var(--ink-2)'} />
                      <span className="text-micro font-medium">{opt.label}</span>
                    </button>
                  )
                })}
                {/* 「更多」 toggle — opens secondary row (房子 / 保險). */}
                <button
                  type="button"
                  onClick={() => setMoreOpen(v => !v)}
                  aria-expanded={showSecondaryRow}
                  className="flex flex-col items-center gap-1 py-3 rounded-[14px] cursor-pointer"
                  style={{
                    background: 'var(--surface)',
                    color: 'var(--ink-2)',
                    border: showSecondaryRow ? '1px solid var(--ink)' : '1px solid transparent',
                  }}
                >
                  <span className="text-button leading-[20px] font-semibold tracking-[1px]" aria-hidden="true">⋯</span>
                  <span className="text-micro font-medium">更多</span>
                </button>
              </div>

              {showSecondaryRow && (
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {/* Right-align secondary tiles under the 「更多」 toggle so the
                      visual hierarchy reads "tap 更多 → those reveal below it". */}
                  {Array.from({ length: 5 - SECONDARY_TYPE_OPTIONS.length }).map((_, i) => (
                    <div key={`pad-${i}`} aria-hidden="true" />
                  ))}
                  {SECONDARY_TYPE_OPTIONS.map(opt => {
                    const sel = selectedType === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleTypeChange(opt.value)}
                        className="flex flex-col items-center gap-1 py-3 rounded-[14px] border-0 cursor-pointer"
                        style={{
                          background: sel ? 'var(--accent)' : 'var(--surface)',
                          color: sel ? '#fff' : 'var(--ink-2)',
                        }}
                      >
                        <AssetIcon type={opt.value} size={20} color={sel ? '#fff' : 'var(--ink-2)'} />
                        <span className="text-micro font-medium">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Name field */}
          <Field label="名稱">
            <input
              ref={nameInputRef}
              value={name}
              onChange={e => setName(e.target.value.slice(0, 32))}
              placeholder={namePlaceholder}
              className="w-full bg-transparent border-0 outline-none text-base"
              style={{ color: 'var(--ink)' }}
            />
          </Field>

          {/* Car-only fields */}
          {isCar && (
            <>
              {/* Color picker */}
              <Field label="顏色">
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
                  >
                    —
                  </button>
                </div>
              </Field>

              <Field label="車牌">
                <input
                  value={plate}
                  onChange={e => setPlate(e.target.value.slice(0, 16))}
                  placeholder="例：ABC-1234"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                />
              </Field>

              <Field label="年份">
                <input
                  value={year}
                  onChange={e => setYear(e.target.value.slice(0, 4))}
                  type="number"
                  inputMode="numeric"
                  placeholder="例：2019"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }}
                />
              </Field>

              <Field label="品牌">
                <input
                  value={brand}
                  onChange={e => setBrand(e.target.value.slice(0, 32))}
                  placeholder="例：Toyota"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }}
                />
              </Field>

              <Field label="型號">
                <input
                  value={model}
                  onChange={e => setModel(e.target.value.slice(0, 32))}
                  placeholder="例：Altis"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }}
                />
              </Field>

              <Field label="購入日期（選填）">
                <button
                  type="button"
                  className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-0 text-base"
                  style={{ color: purchasedAt ? 'var(--ink)' : 'var(--ink-3)' }}
                  onClick={() => setShowCal(v => !v)}
                >
                  <CalIcon size={16} />
                  {purchasedAt ? dateLabel(purchasedAt) : '選擇日期'}
                  <Chevron />
                </button>
                {showCal && (
                  <MiniCalendar
                    value={purchasedAt ?? localTodayISO()}
                    onChange={d => { setPurchasedAt(d); setShowCal(false) }}
                  />
                )}
              </Field>

              <Field label="購入價格（選填）">
                <div className="flex items-center gap-1">
                  <span className="text-sm" style={{ color: 'var(--ink-3)' }}>NT$</span>
                  <input
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    placeholder="0"
                    inputMode="numeric"
                    className="flex-1 bg-transparent border-0 outline-none text-base tnum"
                    style={{ color: 'var(--ink)' }}
                  />
                </div>
              </Field>

              <Field label="目前里程（選填）">
                <div className="flex items-center gap-1">
                  <input
                    value={initialOdometer}
                    onChange={e => setInitialOdometer(e.target.value)}
                    type="number"
                    inputMode="numeric"
                    placeholder="例：50000"
                    className="flex-1 bg-transparent border-0 outline-none text-base"
                    style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--ink-3)' }}>km</span>
                </div>
              </Field>
            </>
          )}

          {isCar && (
            <>
              {/* Fuel Type */}
              <Field label="油種">
                <FuelTypeButtonGroup value={fuelType} onChange={setFuelType} />
              </Field>

              {/* Primary User (hidden in solo mode — PrimaryUserToggle returns null) */}
              <Field label="主要使用人">
                <PrimaryUserToggle value={primaryUserId} onChange={setPrimaryUserId} />
              </Field>
            </>
          )}

          {selectedType === 'child' && (
            <>
              <Field label="小名">
                <input value={childNickname} onChange={e => setChildNickname(e.target.value.slice(0, 20))}
                  placeholder="元寶" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="性別">
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(58,36,25,0.05)' }}>
                  {([{v: 'male' as const, label: '男孩'}, {v: 'female' as const, label: '女孩'}]).map(o => (
                    <button key={o.v} type="button" onClick={() => setChildGender(o.v)}
                      className="flex-1 h-9 rounded-[9px] text-sm font-medium"
                      style={{
                        border: 'none',
                        background: childGender === o.v ? '#fff' : 'transparent',
                        color: childGender === o.v ? 'var(--ink)' : 'var(--ink-2)',
                        boxShadow: childGender === o.v ? '0 1px 3px rgba(58,36,25,0.10)' : 'none',
                      }}>{o.label}</button>
                  ))}
                </div>
              </Field>

              <Field label="出生日期">
                <input value={childBirthday} onChange={e => setChildBirthday(e.target.value)}
                  type="date" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>身分證件</div>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <Field label="身分證號">
                <div className="flex items-center gap-2">
                  <input
                    value={childNationalId}
                    onChange={e => {
                      setChildNationalId(e.target.value.slice(0, 20))
                      // Typing voids any pending clear — the user clearly wants
                      // to set a new value, not clear.
                      if (childWantClearNationalId) setChildWantClearNationalId(false)
                    }}
                    placeholder={
                      childWantClearNationalId
                        ? '已標記清除（儲存後生效）'
                        : (isEdit && childHasNationalId
                            ? '已加密儲存，留空即不變更'
                            : 'A123456789')
                    }
                    className="flex-1 bg-transparent border-0 outline-none text-base"
                    style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                  />
                  {isEdit && childHasNationalId && !childWantClearNationalId && childNationalId.trim() === '' && (
                    <button
                      type="button"
                      onClick={() => setChildWantClearNationalId(true)}
                      className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
                      style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
                    >
                      清除
                    </button>
                  )}
                  {isEdit && childWantClearNationalId && (
                    <button
                      type="button"
                      onClick={() => setChildWantClearNationalId(false)}
                      className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
                      style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
                    >
                      取消
                    </button>
                  )}
                </div>
              </Field>

              <Field label="健保卡號">
                <div className="flex items-center gap-2">
                  <input
                    value={childNhiNo}
                    onChange={e => {
                      setChildNhiNo(e.target.value.slice(0, 20))
                      if (childWantClearNhiNo) setChildWantClearNhiNo(false)
                    }}
                    placeholder={
                      childWantClearNhiNo
                        ? '已標記清除（儲存後生效）'
                        : (isEdit && childHasNhiNo
                            ? '已加密儲存，留空即不變更'
                            : '0000-1234-5678-90')
                    }
                    className="flex-1 bg-transparent border-0 outline-none text-base"
                    style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
                  />
                  {isEdit && childHasNhiNo && !childWantClearNhiNo && childNhiNo.trim() === '' && (
                    <button
                      type="button"
                      onClick={() => setChildWantClearNhiNo(true)}
                      className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
                      style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
                    >
                      清除
                    </button>
                  )}
                  {isEdit && childWantClearNhiNo && (
                    <button
                      type="button"
                      onClick={() => setChildWantClearNhiNo(false)}
                      className="text-xs px-2 py-1 rounded-md cursor-pointer border-0"
                      style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
                    >
                      取消
                    </button>
                  )}
                </div>
              </Field>

              <Field label="血型">
                <div className="flex gap-1.5">
                  {(['A', 'B', 'O', 'AB'] as const).map(b => (
                    <button key={b} type="button" onClick={() => setChildBloodType(b)}
                      className="flex-1 h-9 rounded-[10px] text-label font-semibold"
                      style={{
                        border: childBloodType === b ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                        background: childBloodType === b ? 'rgba(58,36,25,0.04)' : '#fff',
                        color: childBloodType === b ? 'var(--ink)' : 'var(--ink-2)',
                        fontFamily: 'var(--font-numeric)',
                      }}>{b}</button>
                  ))}
                </div>
              </Field>

              <Field label="出生醫院">
                <input value={childHospital} onChange={e => setChildHospital(e.target.value.slice(0, 32))}
                  placeholder="臺大醫院" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>身體紀錄（可之後補）</div>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Field label="身高">
                    <input value={childHeightCm} onChange={e => setChildHeightCm(e.target.value)}
                      type="number" inputMode="numeric" placeholder="102"
                      className="w-full bg-transparent border-0 outline-none text-base"
                      style={{ color: 'var(--ink)' }} />
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>cm</span>
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="體重">
                    <input value={childWeightKg} onChange={e => setChildWeightKg(e.target.value)}
                      type="number" inputMode="decimal" placeholder="16.4"
                      className="w-full bg-transparent border-0 outline-none text-base"
                      style={{ color: 'var(--ink)' }} />
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>kg</span>
                  </Field>
                </div>
              </div>
            </>
          )}

          {selectedType === 'pet' && (
            <>
              <Field label="種類">
                <div className="flex flex-wrap gap-1.5">
                  {[{v: 'cat', label: '貓'},{v: 'dog', label: '狗'},{v: 'rabbit', label: '兔'},{v: 'bird', label: '鳥'},{v: 'fish', label: '魚'},{v: 'other', label: '其他'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setPetSpecies(o.v)}
                      className="h-[34px] px-[14px] rounded-[10px] text-label"
                      style={{
                        border: petSpecies === o.v ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                        background: petSpecies === o.v ? 'rgba(58,36,25,0.04)' : '#fff',
                        color: petSpecies === o.v ? 'var(--ink)' : 'var(--ink-2)',
                        fontWeight: petSpecies === o.v ? 600 : 500,
                      }}>{o.label}</button>
                  ))}
                </div>
              </Field>

              <Field label="品種 / 品名">
                <input value={petBreed} onChange={e => setPetBreed(e.target.value.slice(0, 32))}
                  placeholder="美短" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="性別">
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(58,36,25,0.05)' }}>
                  {([{v: 'male' as const, label: '男孩'}, {v: 'female' as const, label: '女孩'}, {v: 'unknown' as const, label: '不明'}]).map(o => (
                    <button key={o.v} type="button" onClick={() => setPetSex(o.v)}
                      className="flex-1 h-9 rounded-[9px] text-sm font-medium"
                      style={{
                        border: 'none',
                        background: petSex === o.v ? '#fff' : 'transparent',
                        color: petSex === o.v ? 'var(--ink)' : 'var(--ink-2)',
                        boxShadow: petSex === o.v ? '0 1px 3px rgba(58,36,25,0.10)' : 'none',
                      }}>{o.label}</button>
                  ))}
                </div>
              </Field>

              <Field label="出生日">
                <input value={petBirthDate} onChange={e => setPetBirthDate(e.target.value)}
                  type="date" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="到家日">
                <input value={petAdoptedDate} onChange={e => setPetAdoptedDate(e.target.value)}
                  type="date" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="領養金額">
                <input value={petCost} onChange={e => setPetCost(e.target.value)}
                  type="number" inputMode="numeric" placeholder="12000"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
              </Field>

              <Field label="體重">
                <input value={petWeightKg} onChange={e => setPetWeightKg(e.target.value)}
                  type="number" inputMode="decimal" placeholder="4.2"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>kg</span>
              </Field>

              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>健康 / 證件</div>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <Field label="晶片號">
                <input value={petChipNo} onChange={e => setPetChipNo(e.target.value.slice(0, 20))}
                  placeholder="900141001234567" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }} />
              </Field>

              <Field label="獸醫院">
                <input value={petVet} onChange={e => setPetVet(e.target.value.slice(0, 32))}
                  placeholder="永和動物醫院" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>
            </>
          )}

          {selectedType === 'plant' && (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Field label="種類">
                    <input value={plantSpecies} onChange={e => setPlantSpecies(e.target.value.slice(0, 32))}
                      placeholder="例：龜背芋" className="w-full bg-transparent border-0 outline-none text-base"
                      style={{ color: 'var(--ink)' }} />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="位置">
                    <input value={plantLocation} onChange={e => setPlantLocation(e.target.value.slice(0, 32))}
                      placeholder="北向陽台" className="w-full bg-transparent border-0 outline-none text-base"
                      style={{ color: 'var(--ink)' }} />
                  </Field>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Field label="入手日">
                    <input value={plantSproutedAt} onChange={e => setPlantSproutedAt(e.target.value)}
                      type="date" className="w-full bg-transparent border-0 outline-none text-base"
                      style={{ color: 'var(--ink)' }} />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="入手金額">
                    <input value={plantCost} onChange={e => setPlantCost(e.target.value)}
                      type="number" inputMode="numeric" placeholder="1850"
                      className="w-full bg-transparent border-0 outline-none text-base"
                      style={{ color: 'var(--ink)' }} />
                    <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
                  </Field>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>照顧週期</div>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <Field label="多久澆一次水">
                <div className="flex gap-1.5">
                  {[2, 3, 7, 14, 30].map(d => (
                    <button key={d} type="button" onClick={() => setPlantWaterEvery(d)}
                      className="flex-1 h-10 rounded-[10px] text-label font-semibold"
                      style={{
                        border: plantWaterEvery === d ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                        background: plantWaterEvery === d ? 'rgba(58,36,25,0.04)' : '#fff',
                        color: plantWaterEvery === d ? 'var(--ink)' : 'var(--ink-2)',
                        fontFamily: 'var(--font-numeric)',
                      }}>{d}</button>
                  ))}
                  <span className="self-center text-xs ml-1" style={{ color: 'var(--ink-3)' }}>天</span>
                </div>
              </Field>
            </>
          )}

          {selectedType === 'house' && (
            <div className="flex flex-col gap-3 px-5 pb-2">
              {/* Address */}
              <div className="flex flex-col gap-1">
                <label className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>地址</label>
                <input
                  type="text"
                  placeholder="例：台北市大安區某路1號"
                  value={houseAddress}
                  onChange={e => setHouseAddress(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
                />
              </div>

              {/* Purchase date */}
              <div className="flex flex-col gap-1">
                <label className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>購入日期</label>
                <button
                  type="button"
                  onClick={() => setShowCal(c => !c)}
                  className="w-full rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between"
                  style={{ background: 'var(--surface)', color: housePurchasedAt ? 'var(--ink)' : 'var(--ink-3)', border: '1.5px solid var(--border)' }}
                >
                  <span>{housePurchasedAt ? dateLabel(housePurchasedAt) : '選擇日期'}</span>
                  <CalIcon size={16} />
                </button>
                {showCal && (
                  <MiniCalendar
                    value={housePurchasedAt || localTodayISO()}
                    onChange={d => { setHousePurchasedAt(d); setShowCal(false) }}
                  />
                )}
              </div>

              {/* Purchase price */}
              <div className="flex flex-col gap-1">
                <label className="text-micro tracking-[1px] uppercase" style={{ color: 'var(--ink-3)' }}>購入金額</label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="例：15000000"
                  value={housePurchasePrice}
                  onChange={e => setHousePurchasePrice(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
                />
              </div>
            </div>
          )}

          {selectedType === 'insurance' && (
            <>
              <Field label="險種">
                <div className="flex flex-wrap gap-1.5">
                  {[{v:'medical',label:'醫療'},{v:'life',label:'壽險'},{v:'accident',label:'意外'},{v:'cancer',label:'癌症'},{v:'illness',label:'重大傷病'},{v:'car',label:'汽車'},{v:'savings',label:'儲蓄'}].map(o => (
                    <button key={o.v} type="button" onClick={() => setInsKind(o.v)}
                      className="h-[34px] px-[14px] rounded-[10px] text-label"
                      style={{
                        border: insKind === o.v ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                        background: insKind === o.v ? 'rgba(58,36,25,0.04)' : '#fff',
                        color: insKind === o.v ? 'var(--ink)' : 'var(--ink-2)',
                        fontWeight: insKind === o.v ? 600 : 500,
                      }}>{o.label}</button>
                  ))}
                </div>
              </Field>

              <Field label="被保人">
                <input value={insInsured} onChange={e => setInsInsured(e.target.value.slice(0, 32))}
                  placeholder="小元" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="保險公司">
                <input value={insInsurer} onChange={e => setInsInsurer(e.target.value.slice(0, 32))}
                  placeholder="南山人壽" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="保單號">
                <input value={insPolicyNo} onChange={e => setInsPolicyNo(e.target.value.slice(0, 32))}
                  placeholder="NSL-2022-0814-001" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }} />
              </Field>

              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>保費與保額</div>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <Field label="年繳保費">
                <input value={insPremium} onChange={e => setInsPremium(e.target.value)}
                  type="number" inputMode="numeric" placeholder="24960"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
              </Field>

              <Field label="保額">
                <input value={insSumInsured} onChange={e => setInsSumInsured(e.target.value)}
                  type="number" inputMode="numeric" placeholder="3000000"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
              </Field>

              {insKind === 'savings' && (
                <Field label="預估滿期金">
                  <input
                    value={insExpectedMaturityAmount}
                    onChange={e => setInsExpectedMaturityAmount(e.target.value)}
                    type="number"
                    inputMode="numeric"
                    placeholder="600000"
                    className="w-full bg-transparent border-0 outline-none text-base"
                    style={{ color: 'var(--ink)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--ink-3)' }}>NT$</span>
                </Field>
              )}

              <Field label="繳費週期">
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(58,36,25,0.05)' }}>
                  {([{v:'annual',label:'年繳'},{v:'semi',label:'半年'},{v:'quarterly',label:'季繳'},{v:'monthly',label:'月繳'}]).map(o => (
                    <button key={o.v} type="button" onClick={() => setInsPayCycle(o.v)}
                      className="flex-1 h-8 rounded-[9px] text-xs font-medium"
                      style={{
                        border: 'none',
                        background: insPayCycle === o.v ? '#fff' : 'transparent',
                        color: insPayCycle === o.v ? 'var(--ink)' : 'var(--ink-2)',
                        boxShadow: insPayCycle === o.v ? '0 1px 3px rgba(58,36,25,0.10)' : 'none',
                      }}>{o.label}</button>
                  ))}
                </div>
              </Field>

              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>合約期間</div>
                <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
              </div>

              <Field label="保單起">
                <input value={insStartsAt} onChange={e => setInsStartsAt(e.target.value)}
                  type="date" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="保單迄">
                <input value={insEndsAt} onChange={e => setInsEndsAt(e.target.value)}
                  type="date" className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
              </Field>

              <Field label="年期">
                <input value={insTermYears} onChange={e => setInsTermYears(e.target.value)}
                  type="number" inputMode="numeric" placeholder="20"
                  className="w-full bg-transparent border-0 outline-none text-base"
                  style={{ color: 'var(--ink)' }} />
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>年</span>
              </Field>

              {carAssets.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>關聯車輛（選填）</div>
                    <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                  </div>
                  <Field label="關聯車輛">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setInsVehicleId(null)}
                        className="h-[34px] px-[14px] rounded-[10px] text-label"
                        style={{
                          border: insVehicleId === null ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                          background: insVehicleId === null ? 'rgba(58,36,25,0.04)' : '#fff',
                          color: insVehicleId === null ? 'var(--ink)' : 'var(--ink-2)',
                          fontWeight: insVehicleId === null ? 600 : 500,
                        }}
                      >
                        不關聯
                      </button>
                      {carAssets.map(car => (
                        <button
                          key={car.id}
                          type="button"
                          onClick={() => setInsVehicleId(car.id)}
                          className="h-[34px] px-[14px] rounded-[10px] text-label"
                          style={{
                            border: insVehicleId === car.id ? `1.5px solid var(--ink)` : `1px solid var(--hairline)`,
                            background: insVehicleId === car.id ? 'rgba(58,36,25,0.04)' : '#fff',
                            color: insVehicleId === car.id ? 'var(--ink)' : 'var(--ink-2)',
                            fontWeight: insVehicleId === car.id ? 600 : 500,
                          }}
                        >
                          {car.name}{car.plate ? ` · ${car.plate}` : ''}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}
            </>
          )}

          {error && (
            <div className="mt-3 text-sm" style={{ color: 'var(--error, #c0392b)' }}>
              {error}
            </div>
          )}

          {/* Primary save at the bottom of the form so a long fill-out
              (車 / 保險) can submit without scrolling back to the top-right
              save. The top-right save stays as a secondary affordance. */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="mt-6 w-full h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer disabled:cursor-default"
            style={{
              background: canSave ? 'var(--accent)' : 'var(--ink-3)',
              opacity: canSave ? 1 : 0.55,
              boxShadow: canSave ? '0 2px 6px rgba(224,136,86,0.3)' : 'none',
            }}
          >
            {pending ? '儲存中…' : (isEdit ? '儲存變更' : '新增愛物')}
          </button>

          {isEdit && (
            <button
              type="button"
              className="mt-3 w-full py-3 rounded-[14px] text-sm font-medium cursor-pointer border-0"
              style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
              onClick={() => setConfirmingDelete(true)}
            >
              刪除
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title="確認刪除？"
        description="這個愛物與所有關聯花費將從列表中移除。"
        confirmLabel="刪除"
        pending={pending}
        onConfirm={performDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="py-3"
      style={{ borderBottom: '1px solid var(--hairline)' }}
    >
      <div className="text-xs mb-1 tracking-wide" style={{ color: 'var(--ink-3)' }}>{label}</div>
      {children}
    </div>
  )
}
