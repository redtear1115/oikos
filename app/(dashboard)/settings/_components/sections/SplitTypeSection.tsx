'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateDefaultSplitType } from '@/actions/profile'
import type { SplitType } from '@/lib/balance'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

interface Props {
  current: SplitType
  isSolo: boolean
}

export function SplitTypeSection({ current, isSolo }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // In solo mode the only valid configuration is all_mine, so the radio is
  // visually locked to that value. The user's stored preference (in DB) is
  // preserved untouched and re-takes effect when partner joins.
  const displayed: SplitType = isSolo ? 'all_mine' : current

  const handleChange = (next: SplitType) => {
    if (next === current) return
    setError(null)
    startTransition(async () => {
      try {
        await updateDefaultSplitType(next)
        router.refresh()
      } catch (e) {
        setError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError))
      }
    })
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t.settings.defaultSplitLabel}
        className="rounded-card overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        {([
          { id: 'half' as const,       label: t.splitType.even },
          { id: 'all_mine' as const,   label: t.splitType.allMine },
          { id: 'all_theirs' as const, label: t.splitType.allPartners },
        ]).map((opt, i) => {
          const sel = displayed === opt.id
          return (
            <button
              type="button"
              key={opt.id}
              role="radio"
              aria-checked={sel}
              onClick={() => handleChange(opt.id)}
              disabled={saving || isSolo}
              className="flex items-center justify-between px-4 py-3 text-left cursor-pointer disabled:cursor-default disabled:opacity-60"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                background: 'transparent',
              }}
            >
              <span className="text-base" style={{ color: 'var(--ink)' }}>{opt.label}</span>
              <div
                className="w-5 h-5 rounded-full transition-all duration-150"
                style={{
                  border: sel ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
                  background: sel ? 'var(--ink)' : 'transparent',
                  boxShadow: sel ? 'inset 0 0 0 3px var(--surface)' : 'none',
                }}
              />
            </button>
          )
        })}
      </div>
      {isSolo && (
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--ink-3)' }}>
          {t.settings.soloLockHint}
        </div>
      )}
      {error && (
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit)' }}>{error}</div>
      )}
    </div>
  )
}
