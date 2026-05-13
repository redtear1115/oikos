'use client'

import { useState, useEffect } from 'react'
import { TypePicker } from './TypePicker'
import { CarSheetBody } from './CarSheetBody'
import { ChildSheetBody } from './ChildSheetBody'
import { PetSheetBody } from './PetSheetBody'
import { PlantSheetBody } from './PlantSheetBody'
import { HouseSheetBody } from './HouseSheetBody'
import { InsuranceSheetBody } from './InsuranceSheetBody'
import { TemplateSheetBody } from './TemplateSheetBody'
import type { AssetSheetInitial, PickerType } from './types'

export type { AssetSheetInitial } from './types'

interface Props {
  open: boolean
  onClose: () => void
  initial?: AssetSheetInitial
  /** Create-mode preselection. Ignored in edit mode (locked to initial.type). */
  initialType?: PickerType
  onMutated?: (kind: 'saved' | 'deleted') => void
}

// Pure dispatcher: chooses the right *SheetBody by asset type. Each body owns
// its own state, save/delete handlers, and sheet chrome (via shared/SheetShell).
// The type picker (create mode only) is rendered here and threaded into the
// body as a slot so it appears above the body's form fields.
//
// #222 — selecting 「物品」 (type='item') routes to TemplateSheetBody, which
// handles the new template path (currently the single `general` template).
// The five emotion-rich types + `insurance` keep their dedicated bodies and
// the existing *Details subtable flows intact.
export function AssetSheet({ open, onClose, initial, initialType, onMutated }: Props) {
  const isEdit = !!initial
  const initialPickerType: PickerType = isEdit
    ? (initial!.templateKey != null ? 'item' : (initial!.type as PickerType))
    : (initialType ?? 'pet')
  const [selectedType, setSelectedType] = useState<PickerType>(initialPickerType)

  useEffect(() => {
    if (!open) return
    setSelectedType(initialPickerType)
  }, [open, initialPickerType])

  // #236 — 'insurance' is added via the 守護 tab, which opens the sheet with
  // initialType='insurance'. In that flow the user has already committed to
  // a single type, so suppress the picker (and it no longer lists insurance
  // anyway). The 愛物 tab's FAB still gets the full picker.
  const isGuardianInsuranceFlow = !isEdit && selectedType === 'insurance'
  const typePickerSlot = isEdit || isGuardianInsuranceFlow ? null : (
    <TypePicker value={selectedType} onChange={setSelectedType} />
  )

  // Keyed remount on type change in create mode mirrors the original's
  // wholesale state reset; in edit mode `selectedType` is locked so this is
  // a stable key.
  const bodyKey = `${selectedType}-${initial?.id ?? 'new'}`
  const shared = { key: bodyKey, open, onClose, onMutated, typePickerSlot }
  const editInitial = isEdit ? initial : undefined

  switch (selectedType) {
    case 'car':       return <CarSheetBody       {...shared} initial={editInitial} />
    case 'child':     return <ChildSheetBody     {...shared} initial={editInitial} />
    case 'pet':       return <PetSheetBody       {...shared} initial={editInitial} />
    case 'plant':     return <PlantSheetBody     {...shared} initial={editInitial} />
    case 'house':     return <HouseSheetBody     {...shared} initial={editInitial} />
    case 'insurance': return <InsuranceSheetBody {...shared} initial={editInitial} />
    case 'item':      return <TemplateSheetBody  {...shared} initial={editInitial} />
  }
}
