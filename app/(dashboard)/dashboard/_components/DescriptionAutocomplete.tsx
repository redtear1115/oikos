'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { DescIcon } from '@/app/(dashboard)/_components/sheet-icons'

interface Props {
  value: string
  onChange: (next: string) => void
  /** Already-deduped, frequency-sorted descriptions from the household. */
  suggestions: string[]
  placeholder: string
  /** Aria label for the suggestion listbox. */
  listboxLabel: string
}

const MAX_VISIBLE = 6

/**
 * Filter suggestions for the current input. Prefix matches (case-insensitive)
 * rank above substring matches; an exact match is dropped because there is
 * nothing left to autocomplete to. Returns at most MAX_VISIBLE entries.
 */
function filterSuggestions(value: string, all: string[]): string[] {
  const q = value.trim().toLowerCase()
  if (!q) return []
  const prefix: string[] = []
  const contains: string[] = []
  for (const s of all) {
    const lower = s.toLowerCase()
    if (lower === q) continue
    if (lower.startsWith(q)) prefix.push(s)
    else if (lower.includes(q)) contains.push(s)
    if (prefix.length + contains.length >= MAX_VISIBLE * 2) break
  }
  return [...prefix, ...contains].slice(0, MAX_VISIBLE)
}

export function DescriptionAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  listboxLabel,
}: Props) {
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => filterSuggestions(value, suggestions), [value, suggestions])
  const open = focused && filtered.length > 0

  // Reset active index whenever the visible list changes so the highlight never
  // points past the end of the list (and the first row is highlighted by default).
  useEffect(() => {
    setActive(0)
  }, [filtered.length, value])

  const choose = (s: string) => {
    onChange(s)
    // Do NOT blur here: setting the value to an exact match causes
    // filterSuggestions to exclude it, so the dropdown closes automatically
    // without us touching keyboard focus. Blurring would hide the Android
    // soft keyboard and trigger a spurious popstate that closes the sheet (#872).
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(filtered[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setFocused(false)
    }
  }

  return (
    <div className="relative">
      <div
        className="px-5 py-3.5 flex items-center gap-3.5"
        style={{ borderBottom: '1px solid var(--hairline)' }}
      >
        <DescIcon />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-0 outline-none text-base py-1"
          style={{ color: 'var(--ink)' }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="description-suggestions"
          autoComplete="off"
        />
      </div>

      {open && (
        <ul
          id="description-suggestions"
          role="listbox"
          aria-label={listboxLabel}
          className="absolute left-0 right-0 z-10 max-h-64 overflow-auto"
          style={{
            top: '100%',
            background: 'var(--bg)',
            borderBottom: '1px solid var(--hairline)',
            boxShadow: '0 8px 18px rgba(31,27,22,0.08)',
          }}
        >
          {filtered.map((s, i) => {
            const isActive = i === active
            return (
              <li
                key={s}
                role="option"
                aria-selected={isActive}
                // onMouseDown fires before the input's blur, so preventDefault
                // keeps focus on the input and our `choose` runs deterministically
                // on both desktop click and mobile touch.
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(s)
                }}
                onMouseEnter={() => setActive(i)}
                className="px-5 py-2.5 text-base cursor-pointer flex items-center gap-3.5 select-none"
                style={{
                  color: 'var(--ink)',
                  background: isActive ? 'var(--surface)' : 'transparent',
                }}
              >
                {/* Hidden spacer matches the icon width so suggestion text
                    aligns with the input value above. */}
                <span aria-hidden="true" style={{ width: 22, flexShrink: 0 }} />
                <span className="flex-1 truncate">{s}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
