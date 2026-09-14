'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateDefaultSplitType } from '@/actions/profile'
import type { SplitType } from '@/lib/balance'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { onRadioGroupKeyDown, rovingTabIndex } from '@/app/(dashboard)/_components/radioGroup'

interface Props {
  current: SplitType
  isSolo: boolean
}

export function SplitTypeSection({ current, isSolo }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleChange = (next: SplitType) => {
    if (saving || next === current) return
    setError(null)
    startTransition(async () => {
      try {
        await updateDefaultSplitType(next)
        router.refresh()
      } catch (e) {
        setError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError, t.errors.actions))
      }
    })
  }

  // Solo has exactly one valid configuration, so the section stops being a
  // choice and becomes a readout of what the ledger is set to (#1122). It is
  // rendered rather than collapsed to a bare hint because a settings row's
  // job is to show the current value — and it is a static row rather than a
  // disabled radio because a greyed-out "all theirs" next to a partner who
  // isn't here reads as an interface the user has failed to complete.
  //
  // The DB preference is deliberately left untouched: nothing here writes,
  // so a duo-era choice comes back intact when a partner joins.
  if (isSolo) {
    return (
      <div>
        <div
          role="group"
          aria-label={t.settings.defaultSplitLabel}
          className="rounded-card overflow-hidden flex flex-col"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-base" style={{ color: 'var(--ink)' }}>{t.splitType.allMine}</span>
            <SplitRadioDot selected />
          </div>
        </div>
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--ink-3)' }}>
          {t.settings.soloLockHint}
        </div>
      </div>
    )
  }

  // `current` can be a split type this group doesn't offer: 'weighted' is
  // pickable per-record in AddSheet but has no row here. With nothing checked
  // the first row has to become the group's Tab stop, or the whole group drops
  // out of the keyboard order — it looks fine, it just can't be reached by Tab
  // (#1242 follow-up).
  const options = [
    { id: 'half' as const,       label: t.splitType.even },
    { id: 'all_mine' as const,   label: t.splitType.allMine },
    { id: 'all_theirs' as const, label: t.splitType.allPartners },
  ]
  const anyChecked = options.some((opt) => opt.id === current)

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t.settings.defaultSplitLabel}
        onKeyDown={onRadioGroupKeyDown}
        className="rounded-card overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        {options.map((opt, i) => {
          const sel = current === opt.id
          return (
            <button
              type="button"
              key={opt.id}
              role="radio"
              aria-checked={sel}
              tabIndex={rovingTabIndex(sel, i === 0, anyChecked)}
              onClick={() => handleChange(opt.id)}
              // `aria-disabled`, not `disabled`, while saving (#1242): an arrow
              // key selects and saves, and a real `disabled` would drop focus
              // off the radio the user just moved to — the next arrow press
              // then goes nowhere. handleChange ignores presses while saving.
              aria-disabled={saving || undefined}
              className="flex items-center justify-between min-h-11 px-4 py-3 text-left cursor-pointer aria-disabled:cursor-default aria-disabled:opacity-60"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                background: 'transparent',
              }}
            >
              <span className="text-base" style={{ color: 'var(--ink)' }}>{opt.label}</span>
              <SplitRadioDot selected={sel} />
            </button>
          )
        })}
      </div>
      {error && (
        <div className="text-xs mt-2 px-1" style={{ color: 'var(--debit-text)' }}>{error}</div>
      )}
    </div>
  )
}

function SplitRadioDot({ selected }: { selected: boolean }) {
  return (
    <div
      className="w-5 h-5 rounded-full transition-all duration-150"
      style={{
        border: selected ? '6px solid var(--ink)' : '1.5px solid var(--hairline)',
        background: selected ? 'var(--ink)' : 'transparent',
        boxShadow: selected ? 'inset 0 0 0 3px var(--surface)' : 'none',
      }}
    />
  )
}
