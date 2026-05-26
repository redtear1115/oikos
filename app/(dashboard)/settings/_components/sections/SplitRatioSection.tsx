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

export function SplitRatioSection({ viewerName, partnerName, initialRatioA }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const { viewerIsA } = useMember()
  // DB column is member A's share; the slider tracks the viewer's share so
  // the label below it always reads "{viewerName} … X%" truthfully.
  const [meShare, setMeShare] = useState<number>(toViewerShare(initialRatioA ?? 50, viewerIsA))
  const [saving, startTransition] = useTransition()
  const ticksId = useId()
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      try {
        await updateGroupSplitRatio(toMemberAShare(meShare, viewerIsA))
        router.refresh()
      } catch (e) {
        setError(describeError(e, t.incomeSheet.errors.saveFailed, t.common.offlineError))
      }
    })
  }

  return (
    <section className="flex flex-col gap-3 px-4 py-5 rounded-card" style={{ background: 'var(--surface)' }}>
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
        className="w-full accent-[var(--ink)]"
      />
      <datalist id={ticksId}>
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => (
          <option key={v} value={v} label={`${v}`} />
        ))}
      </datalist>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-1 px-4 py-2 rounded-xl text-sm font-medium"
        style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
      >
        {saving ? t.common.saving : t.settings.saveDefaultRatio}
      </button>
      {error && <p className="text-xs" style={{ color: 'var(--debit)' }}>{error}</p>}
    </section>
  )
}
