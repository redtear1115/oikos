'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateGroupSplitRatio } from '@/actions/group'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { toViewerShare, toMemberAShare } from '@/lib/splitRatio'

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
 *  all three sheet controls feel the same.
 *
 *  Slider state is the **viewer's** share % so the row above always reads
 *  truthfully ("{viewerName} … X%"). The DB column `default_split_ratio_a`
 *  is member A's share; we flip on load + before the wire call so the
 *  stored value stays schema-correct regardless of which member edits. */
export function SplitRatioSection({ viewerName, partnerName, initialRatioA }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const { viewerIsA } = useMember()
  const initial = toViewerShare(initialRatioA ?? 50, viewerIsA)
  const [meShare, setMeShare] = useState<number>(initial)
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
        await updateGroupSplitRatio(toMemberAShare(next, viewerIsA))
        router.refresh()
      } catch (e) {
        // Snap the slider back to where it actually persisted.
        setConfirmed(prev)
        setMeShare(prev)
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
        <span>{viewerName}{t.splitRatioSection.meSuffix}{meShare}%</span>
        <span>{partnerName}{t.splitRatioSection.partnerSuffix}{100 - meShare}%</span>
      </div>
      <input
        type="range"
        min={10}
        max={90}
        step={10}
        list={ticksId}
        value={meShare}
        onChange={e => setMeShare(Number(e.target.value))}
        onPointerUp={() => commit(meShare)}
        onTouchEnd={() => commit(meShare)}
        onKeyUp={() => commit(meShare)}
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
