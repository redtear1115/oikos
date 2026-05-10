'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import {
  MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS,
  codepointLength,
  truncateCodepoints,
  type YearMonth,
} from '@/lib/monthlyReview'
import { upsertMonthlyReviewMessage } from '@/actions/monthlyReview'
import type {
  ReviewEditorMessage,
  ReviewMember,
  ReviewPartnerMessage,
} from './ReviewClient'

const SAVE_DEBOUNCE_MS = 800

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

export function MessageEditor({
  editorMonth,
  ownMessage,
  partnerMessage,
  viewer,
  partner,
  isSolo,
}: {
  editorMonth: YearMonth
  ownMessage: ReviewEditorMessage | null
  partnerMessage: ReviewPartnerMessage | null
  viewer: ReviewMember
  partner: ReviewMember | null
  isSolo: boolean
}) {
  const t = useTranslations()
  const tr = t.monthlyReview

  const locked = !!ownMessage?.lockedAt
  const initial = ownMessage?.body ?? ''

  const [value, setValue] = useState(initial)
  const [savedValue, setSavedValue] = useState(initial)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Defensive cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function scheduleSave(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (next.trim() === savedValue.trim()) return
    timerRef.current = setTimeout(() => { void doSave(next) }, SAVE_DEBOUNCE_MS)
  }

  async function doSave(next: string) {
    if (!next.trim()) return
    setState({ kind: 'saving' })
    try {
      await upsertMonthlyReviewMessage({
        year: editorMonth.year,
        month: editorMonth.month,
        body: next,
      })
      setSavedValue(next)
      setState({ kind: 'saved' })
    } catch (err) {
      const message = err instanceof Error ? err.message : tr.errors.saveFailed
      setState({ kind: 'error', message })
    }
  }

  function handleChange(input: string) {
    if (locked) return
    const truncated = codepointLength(input) > MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS
      ? truncateCodepoints(input, MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS)
      : input
    setValue(truncated)
    setState({ kind: 'idle' })
    scheduleSave(truncated)
  }

  const counter = tr.editorCounter
    .replace('{n}', String(codepointLength(value)))
    .replace('{max}', String(MONTHLY_REVIEW_MESSAGE_MAX_CODEPOINTS))

  return (
    <section>
      <h3
        className="text-base font-medium px-2 mb-3"
        style={{ color: 'var(--ink)', fontFamily: 'var(--font-fraunces)' }}
      >
        {isSolo ? tr.editorTitleSolo : tr.editorTitle}
      </h3>

      {/* Self editor */}
      <div
        className="rounded-[20px] px-4 py-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Avatar
            size={28}
            who="M"
            initial={(viewer.displayName[0] ?? '?').toUpperCase()}
            src={viewer.avatarUrl}
          />
          <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
            {viewer.displayName}
          </span>
        </div>
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          readOnly={locked}
          placeholder={tr.editorPlaceholder}
          rows={3}
          className="w-full resize-none bg-transparent border-0 outline-none text-sm leading-relaxed"
          style={{
            color: 'var(--ink)',
            fontFamily: 'inherit',
            opacity: locked ? 0.7 : 1,
          }}
          aria-label={isSolo ? tr.editorTitleSolo : tr.editorTitle}
        />
        <div
          className="mt-2 flex items-center justify-between text-[11px]"
          style={{ color: 'var(--ink-3)' }}
        >
          <span aria-live="polite">
            {locked
              ? tr.lockedFooter.replace('{date}', formatLockedAt(ownMessage?.lockedAt))
              : state.kind === 'saving'
                ? tr.savingFooter
                : state.kind === 'saved'
                  ? tr.savedFooter
                  : state.kind === 'error'
                    ? tr.errorFooter.replace('{message}', state.message)
                    : ' '}
          </span>
          <span className="tabular-nums">{counter}</span>
        </div>
      </div>

      {/* Partner read-only message (dyad only) */}
      {partner && (
        <div className="mt-3">
          <div
            className="rounded-[20px] px-4 py-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Avatar
                size={28}
                who="T"
                initial={(partner.displayName[0] ?? '?').toUpperCase()}
                src={partner.avatarUrl}
              />
              <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
                {partner.displayName}
              </span>
            </div>
            {partnerMessage?.body ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--ink)' }}>
                {partnerMessage.body}
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                —
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function formatLockedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch {
    return ''
  }
}
