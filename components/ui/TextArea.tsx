'use client'

import { type ComponentPropsWithRef } from 'react'

interface TextAreaProps extends ComponentPropsWithRef<'textarea'> {
  error?: boolean
}

/**
 * Multi-line sibling of TextInput (#1194): same `--input-bg`, hairline
 * border, `--radius-bubble`, 16px text and ember focus ring, with at least
 * the 44px control height. Grows with `rows`; the user can drag it taller.
 *
 * No built-in label: pass `id` + an external `<label htmlFor>`, or
 * `aria-labelledby` / `aria-label`. Symptom if a call site forgets: the field
 * still renders and types fine, but a screen reader announces only the
 * placeholder, or nothing (#1186).
 */
export function TextArea({ error = false, className = '', rows = 3, ...rest }: TextAreaProps) {
  return (
    <textarea
      rows={rows}
      className={[
        'oik-input-wrapper',
        'block w-full min-h-[var(--control-md)]',
        'rounded-bubble border',
        error ? 'border-[var(--destructive)]' : 'border-[var(--hairline)]',
        'bg-[var(--input-bg)]',
        'px-3.5 py-2.5 text-base leading-relaxed text-ink',
        'outline-none resize-y',
        'placeholder:text-ink-3',
        'disabled:opacity-50 disabled:cursor-default',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}
