'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateGroupSplitRatio } from '@/actions/group'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

interface Props {
  viewerName: string
  partnerName: string
  initialRatioA: number | null
}

/** Per-group default split-ratio slider — optimistic instant-save on
 *  slider release (#769). Drag/keyboard moves only update the visible
 *  position; commit fires once on `pointerup` / `touchend` / `keyup`. On
 *  failure we roll the slider back to the last confirmed value and surface
 *  the error inline. Mirrors `GuardianBetaToggle` / `SplitTypeSection` so
 *  all three sheet controls feel the same. */
export function SplitRatioSection({ viewerName, partnerName, initialRatioA }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const initial = initialRatioA ?? 50
  const [ratioA, setRatioA] = useState<number>(initial)
  const [confirmed, setConfirmed] = useState<number>(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const ticksId = useId()

  const commit = (next: number) => {
    if (next === confirmed) return
    const prev = confirmed
    setError(null)
    setConfirmed(next) // optimistic
    startTransition(async () => {
      try {
        await updateGroupSplitRatio(next)
        router.refresh()
      } catch (e) {
        // Snap the slider back to where it actually persisted.
        setConfirmed(prev)
        setRatioA(prev)
        setError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError))
      }
    })
  }

  return (
    <section
      className="flex flex-col gap-3 px-4 py-5 rounded-card transition-opacity duration-150"
      style={{ background: 'var(--surface)', opacity: pending ? 0.7 : 1 }}
    >
      <div className="flex justify-between text-sm" style={{ color: 'var(--ink-3)' }}>
        <span>{viewerName}{t.splitRatioSection.meSuffix}{ratioA}%</span>
        <span>{partnerName}{t.splitRatioSection.partnerSuffix}{100 - ratioA}%</span>
      </div>
      <input
        type="range"
        min={10}
        max={90}
        step={10}
        list={ticksId}
        value={ratioA}
        onChange={e => setRatioA(Number(e.target.value))}
        onPointerUp={() => commit(ratioA)}
        onTouchEnd={() => commit(ratioA)}
        onKeyUp={() => commit(ratioA)}
        aria-busy={pending}
        className="w-full accent-[var(--ink)]"
      />
      <datalist id={ticksId}>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => (
          <option key={v} value={v} label={`${v}`} />
        ))}
      </datalist>
      {error && <p className="text-xs" style={{ color: 'var(--debit)' }} role="alert">{error}</p>}
    </section>
  )
}
