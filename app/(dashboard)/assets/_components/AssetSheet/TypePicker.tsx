'use client'

import { useState } from 'react'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { useTranslations } from '@/lib/i18n/client'
import type { PickerType } from './types'

// Primary tiles always visible (4 + 1 「更多」 toggle = 5 cells in one row).
// Secondary tiles reveal under 「更多」 to keep the row tidy as the type list
// grows. This avoids a wrapped grid that pushes the form down when switching
// types.
//
// #222 — 「物品」 (item, template-based) joins the secondary row alongside the
// other less-emotive types. The five legacy emotion-rich types (car / child /
// pet / plant) stay primary so common flows don't change.
//
// #236 — 'insurance' is intentionally absent: it's a Guardian-module type
// added via the 守護 tab's dedicated entry (which opens AssetSheet with
// initialType='insurance' and suppresses this picker). Server action also
// rejects creation when Guardian is off as a safety net.
const PRIMARY_TYPES: PickerType[] = ['car', 'child', 'pet', 'plant']
const SECONDARY_TYPES: PickerType[] = ['house', 'item']
const isSecondaryType = (t: PickerType) => SECONDARY_TYPES.includes(t)

interface Props {
  value: PickerType
  onChange: (type: PickerType) => void
}

export function TypePicker({ value, onChange }: Props) {
  const t = useTranslations()
  const ts = t.assetSheet
  const typeLabel = (type: PickerType): string => {
    switch (type) {
      case 'car': return ts.type.car
      case 'child': return ts.type.child
      case 'pet': return ts.type.pet
      case 'plant': return ts.type.plant
      case 'house': return ts.type.house
      case 'insurance': return ts.type.insurance
      case 'item': return ts.type.item
    }
  }
  const primaryOptions = PRIMARY_TYPES.map(v => ({ value: v, label: typeLabel(v) }))
  const secondaryOptions = SECONDARY_TYPES.map(v => ({ value: v, label: typeLabel(v) }))

  // Auto-open the secondary row if the currently selected type is secondary,
  // so the user can see what they picked without re-tapping 更多.
  const [moreOpen, setMoreOpen] = useState(false)
  const showSecondaryRow = moreOpen || isSecondaryType(value)

  return (
    <div className="mb-4">
      <div className="text-xs mb-2 tracking-wide" style={{ color: 'var(--ink-3)' }}>{ts.type.label}</div>
      <div className="grid grid-cols-5 gap-2">
        {primaryOptions.map(opt => {
          const sel = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setMoreOpen(false) }}
              aria-pressed={sel}
              className="flex flex-col items-center gap-1 py-3 rounded-bubble border-0 cursor-pointer"
              style={{
                background: sel ? 'var(--accent)' : 'var(--surface)',
                color: sel ? 'var(--on-fill)' : 'var(--ink-2)',
              }}
            >
              <AssetIcon type={opt.value} size={20} color={sel ? 'var(--on-fill)' : 'var(--ink-2)'} />
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          )
        })}
        {/* 「更多」 toggle — opens secondary row (房子 / 保險). */}
        <button
          type="button"
          onClick={() => setMoreOpen(v => !v)}
          aria-expanded={showSecondaryRow}
          className="flex flex-col items-center gap-1 py-3 rounded-bubble cursor-pointer"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink-2)',
            border: showSecondaryRow ? '1px solid var(--ink)' : '1px solid transparent',
          }}
        >
          <span className="text-base leading-[20px] font-medium tracking-[1px]" aria-hidden="true">⋯</span>
          <span className="text-xs font-medium">{ts.type.more}</span>
        </button>
      </div>

      {showSecondaryRow && (
        <div className="grid grid-cols-5 gap-2 mt-2">
          {/* Right-align secondary tiles under the 「更多」 toggle so the
              visual hierarchy reads "tap 更多 → those reveal below it". */}
          {Array.from({ length: 5 - secondaryOptions.length }).map((_, i) => (
            <div key={`pad-${i}`} aria-hidden="true" />
          ))}
          {secondaryOptions.map(opt => {
            const sel = value === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                aria-pressed={sel}
                className="flex flex-col items-center gap-1 py-3 rounded-bubble border-0 cursor-pointer"
                style={{
                  background: sel ? 'var(--accent)' : 'var(--surface)',
                  color: sel ? 'var(--on-fill)' : 'var(--ink-2)',
                }}
              >
                <AssetIcon type={opt.value} size={20} color={sel ? 'var(--on-fill)' : 'var(--ink-2)'} />
                <span className="text-xs font-medium">{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
