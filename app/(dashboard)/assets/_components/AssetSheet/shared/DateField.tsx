'use client'

import { useState } from 'react'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { MiniCalendar } from '@/app/(dashboard)/dashboard/_components/MiniCalendar'
import { localTodayISO } from '@/lib/local-date'
import { formatDateAbsolute } from '@/lib/format-date'
import { useLocale } from '@/lib/i18n/client'
import { Field } from './Field'

interface Props {
  label: string
  value: string | null
  onChange: (d: string) => void
  placeholder: string
}

// Inline-button style date picker (car / [other future types]). Owns its
// own open/closed state — sheet body doesn't need to track it.
export function DateField({ label, value, onChange, placeholder }: Props) {
  const locale = useLocale()
  const [show, setShow] = useState(false)
  return (
    <Field label={label}>
      <button
        type="button"
        className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-0 text-base"
        style={{ color: value ? 'var(--ink)' : 'var(--ink-3)' }}
        onClick={() => setShow(v => !v)}
      >
        <CalIcon size={16} />
        {value ? formatDateAbsolute(value, locale) : placeholder}
        <Chevron />
      </button>
      {show && (
        <MiniCalendar
          value={value ?? localTodayISO()}
          onChange={d => { onChange(d); setShow(false) }}
        />
      )}
    </Field>
  )
}
