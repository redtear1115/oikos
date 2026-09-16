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
 * Two things reviewed in #1252 and deliberately left as they are:
 *
 * - **`min-h` is 44px, not the 64px the hand-written notes textarea carried.**
 *   `min-h` is the shared control floor, not the notes field's height: `rows`
 *   decides that, and every caller uses the default 3 (3 × 1.625 line-height
 *   × 16px + 20px padding + 2px border ≈ 100px). The floor only ever binds at
 *   `rows={1}`, which nothing passes. Raising it to 64px would make the
 *   primitive taller than TextInput for no visible gain.
 * - **`resize-y` cannot push anything under the sheet footer.** Every sheet
 *   panel is `flex flex-col overflow-hidden` at a bounded height, the form
 *   body is `flex-1 overflow-y-auto`, and the footer is a `shrink-0` sibling
 *   of that body. Dragging the textarea taller grows the scrolled content,
 *   never the panel. It is also desktop-only: mobile WebKit and Chrome draw
 *   no resize handle, and this is a mobile-first app.
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
