'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { enterPastEpoch, exitPastEpoch } from '@/actions/epoch-view'

export interface EpochListEntry {
  id: string
  /** ISO timestamp string. */
  startedAt: string
  /** ISO timestamp string, or null when this is the open chapter. */
  endedAt: string | null
  memberAId: string
  memberBId: string | null
  memberAName: string | null
  memberBName: string | null
}

interface Props {
  epochs: EpochListEntry[]
  pinnedEpochId: string | null
  viewerId: string
  locale: string
  t: Translations['pastTimes']
  backLabel: string
}

export function PastTimesList({
  epochs,
  pinnedEpochId,
  viewerId,
  locale,
  t,
  backLabel,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const handleEnter = (epochId: string) => {
    startTransition(async () => {
      await enterPastEpoch(epochId)
      router.push('/dashboard')
    })
  }

  const handleExit = () => {
    startTransition(async () => {
      await exitPastEpoch()
      router.push('/dashboard')
    })
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  // Resolve "the partner during this chapter" from the viewer's POV. The chapter
  // could be solo (one of memberAId/memberBId is null) or duo. Whichever side
  // isn't the viewer becomes the "partner" label.
  const partnerName = (e: EpochListEntry): string | null => {
    if (e.memberAId === viewerId) return e.memberBName
    if (e.memberBId === viewerId) return e.memberAName
    // Viewer wasn't part of this chapter (shouldn't happen with current schema —
    // viewer must be on the group to read its epochs — but guard regardless).
    return e.memberBName ?? e.memberAName
  }

  return (
    <>
      <div className="px-5 pt-[max(env(safe-area-inset-top),24px)] pb-2">
        <Link href="/settings" className="text-sm" style={{ color: 'var(--ink-3)' }}>
          ‹ {backLabel}
        </Link>
      </div>
      <div className="px-5 pb-3">
        <h1
          className="text-2xl font-medium tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.title}
        </h1>
        <p className="text-sm mt-2" style={{ color: 'var(--ink-3)' }}>{t.intro}</p>
      </div>

      {epochs.length === 0 ? (
        <p className="px-5 mt-6 text-sm" style={{ color: 'var(--ink-3)' }}>{t.empty}</p>
      ) : (
        <ul className="px-4 mt-2 flex flex-col gap-3">
          {epochs.map((e) => {
            const isCurrent = e.endedAt === null
            const isPinned = pinnedEpochId === e.id
            const partner = partnerName(e)
            const subline = isCurrent
              ? (partner
                  ? t.currentChapter.replace('{partner}', partner)
                  : t.currentChapterSolo)
              : t.chapterRange
                  .replace('{start}', fmt(e.startedAt))
                  .replace('{end}', e.endedAt ? fmt(e.endedAt) : '')
            const partnerLine = isCurrent
              ? null
              : (partner ? t.withPartner.replace('{partner}', partner) : t.soloLabel)
            return (
              <li
                key={e.id}
                className="rounded-[20px] px-5 py-4 flex flex-col gap-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{subline}</div>
                  {partnerLine && (
                    <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>{partnerLine}</div>
                  )}
                </div>
                {isCurrent ? (
                  isPinned ? null : (
                    pinnedEpochId !== null ? (
                      <button
                        type="button"
                        onClick={handleExit}
                        disabled={pending}
                        className="self-start text-sm cursor-pointer disabled:opacity-50"
                        style={{ background: 'transparent', color: 'var(--ink-2)' }}
                      >
                        {t.bannerExitCta}
                      </button>
                    ) : null
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => handleEnter(e.id)}
                    disabled={pending || isPinned}
                    className="self-start h-10 px-4 rounded-[12px] text-sm font-medium cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--ink)', color: 'var(--surface)' }}
                  >
                    {isPinned ? t.bannerHeading
                        .replace('{start}', fmt(e.startedAt))
                        .replace('{end}', e.endedAt ? fmt(e.endedAt) : '')
                      : t.enterCta}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
