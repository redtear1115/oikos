'use client'

import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import { useTranslations } from '@/lib/i18n/client'
import { ScrollFadeRow } from '@/app/(dashboard)/_components/ScrollFadeRow'

interface CategoryPickerProps {
  value: CategoryId
  onChange: (id: CategoryId) => void
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const t = useTranslations()
  return (
    // Chips stay visually 38px; each ::before adds 3px above and below for a
    // 44px tap area (#1186). The scroller clips overflow at its padding box,
    // so `py-[3px]` gives the pseudo room to exist and `-my-[3px]` cancels
    // that padding out of the layout. Symptom if the padding is dropped:
    // nothing looks different, the extra 3px just stops receiving taps.
    <ScrollFadeRow className="flex gap-2 px-5 py-[3px] -my-[3px]">
      {PICKABLE_CATEGORIES.map(c => {
        const sel = value === c.id
        return (
          <button key={c.id} onClick={() => onChange(c.id)}
            type="button"
            aria-pressed={sel}
            aria-label={t.category[c.id]}
            className="relative before:absolute before:inset-x-0 before:-inset-y-[3px] before:content-[''] h-[38px] pl-2 pr-3 rounded-full text-sm font-medium inline-flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-150"
            style={{
              background: sel ? 'var(--ink)' : 'var(--surface)',
              color: sel ? 'var(--on-fill)' : 'var(--ink)',
              border: sel ? '1px solid var(--ink)' : '1px solid var(--hairline)',
            }}>
            <span aria-hidden="true" className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center text-sm font-medium" style={{ background: c.tint, color: c.ink }}>
              {c.mono}
            </span>
            {t.category[c.id]}
          </button>
        )
      })}
    </ScrollFadeRow>
  )
}
