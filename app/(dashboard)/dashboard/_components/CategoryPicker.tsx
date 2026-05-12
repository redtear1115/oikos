'use client'

import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import { useTranslations } from '@/lib/i18n/client'

interface CategoryPickerProps {
  value: CategoryId
  onChange: (id: CategoryId) => void
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const t = useTranslations()
  return (
    <div className="relative">
      <div className="flex gap-2 px-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {PICKABLE_CATEGORIES.map(c => {
          const sel = value === c.id
          return (
            <button key={c.id} onClick={() => onChange(c.id)}
              className="h-[38px] pl-2 pr-3 rounded-full text-sm font-medium inline-flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-150"
              style={{
                background: sel ? 'var(--ink)' : 'var(--surface)',
                color: sel ? '#fff' : 'var(--ink)',
                border: sel ? '1px solid var(--ink)' : '1px solid var(--hairline)',
              }}>
              <span className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center text-label font-medium" style={{ background: c.tint, color: c.ink }}>
                {c.mono}
              </span>
              {t.category[c.id]}
            </button>
          )
        })}
      </div>
      {/* Fade overlay: signals there are more chips beyond the right edge.
          Fades to the sheet background so the gradient blends seamlessly. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 h-full w-8"
        style={{
          background: 'linear-gradient(to right, transparent, var(--bg))',
        }}
      />
    </div>
  )
}
