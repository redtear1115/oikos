'use client'

import { useState, useEffect } from 'react'
import { TypePicker } from './TypePicker'
import { CarSheetBody } from './CarSheetBody'
import { ChildSheetBody } from './ChildSheetBody'
import { PetSheetBody } from './PetSheetBody'
import { PlantSheetBody } from './PlantSheetBody'
import { HouseSheetBody } from './HouseSheetBody'
import { InsuranceSheetBody } from './InsuranceSheetBody'
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
export function AssetSheet({ open, onClose, initial, initialType, onMutated }: Props) {
  const isEdit = !!initial
  const [selectedType, setSelectedType] = useState<PickerType>(
    (initial?.type ?? initialType ?? 'pet') as PickerType,
  )

  useEffect(() => {
    if (!open) return
    setSelectedType((initial?.type ?? initialType ?? 'pet') as PickerType)
  }, [open, initial, initialType])

  const typePickerSlot = isEdit ? null : (
    <TypePicker value={selectedType} onChange={setSelectedType} />
  )

  // Keyed remount on type change in create mode mirrors the original's
  // wholesale state reset; in edit mode `selectedType` is locked to
  // `initial.type` so this is a stable key.
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
  }
}
