'use client'

import { useEffect, useRef, useState } from 'react'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { normalizeSearchText } from '@/lib/filter'

/** Quiet period after the last keystroke before the query reaches the URL. */
export const SEARCH_DEBOUNCE_MS = 300

interface Props {
  /** The query currently in the URL (`?q=`), '' when none. */
  query: string
  /** Commit a query to the URL. Called with the raw (un-normalized) text. */
  onCommit: (text: string) => void
  onCancel: () => void
}

/**
 * Records search mode header row (#23): the field plus 取消.
 *
 * Input -> URL is debounced, and never fires while an IME composition is in
 * flight (zhuyin / kana would otherwise send half-typed syllables as queries);
 * `compositionend` commits immediately. Enter commits immediately and blurs so
 * the software keyboard closes.
 */
export function RecordsSearchBar({ query, onCommit, onCancel }: Props) {
  const t = useTranslations()
  const [value, setValue] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const composingRef = useRef(false)
  // `onCommit` is a fresh closure every render of the parent; the timer must
  // call the latest one without being a dependency of anything.
  const onCommitRef = useRef(onCommit)
  useEffect(() => { onCommitRef.current = onCommit })
  // Last text this component pushed to the URL, so an echo of our own commit
  // coming back through `query` does not overwrite what the user is typing.
  const lastCommittedRef = useRef(query)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }
  useEffect(() => clearTimer, [])

  // External URL change (back/forward, another control): follow it.
  useEffect(() => {
    if (query !== lastCommittedRef.current) {
      lastCommittedRef.current = query
      setValue(query)
    }
  }, [query])

  const commit = (text: string) => {
    clearTimer()
    lastCommittedRef.current = normalizeSearchText(text) ?? ''
    onCommitRef.current(text)
  }

  return (
    <div className="px-5 pt-[max(var(--safe-top),24px)] pb-3 flex items-center gap-2">
      <TextInput
        ref={inputRef}
        className="flex-1 min-w-0 [&_input]:appearance-none [&_input::-webkit-search-cancel-button]:appearance-none"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus
        aria-label={t.records.searchOpen}
        placeholder={t.records.searchPlaceholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          setValue(next)
          if (composingRef.current) return
          clearTimer()
          timerRef.current = setTimeout(() => commit(next), SEARCH_DEBOUNCE_MS)
        }}
        onCompositionStart={() => {
          composingRef.current = true
          clearTimer()
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false
          const next = e.currentTarget.value
          setValue(next)
          commit(next)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // Enter that confirms an IME candidate is not a search submit.
          if (composingRef.current || e.nativeEvent.isComposing) return
          e.preventDefault()
          commit(e.currentTarget.value)
          e.currentTarget.blur()
        }}
        rightAddon={
          value ? (
            <button
              type="button"
              aria-label={t.records.searchClear}
              onClick={() => {
                setValue('')
                commit('')
                inputRef.current?.focus()
              }}
              className="size-11 -mr-2 flex items-center justify-center border-0 bg-transparent text-ink-3 cursor-pointer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : undefined
        }
      />
      <button
        type="button"
        onClick={() => {
          clearTimer()
          onCancel()
        }}
        className="h-11 px-1 shrink-0 border-0 bg-transparent text-sm text-ink-2 cursor-pointer"
      >
        {t.records.searchCancel}
      </button>
    </div>
  )
}
