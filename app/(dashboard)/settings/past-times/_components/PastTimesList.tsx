'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { enterPastEpoch, exitPastEpoch } from '@/actions/epoch-view'
import { formatDateShort } from '@/lib/format-date'

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

  const fmt = (iso: string) => formatDateShort(iso, locale, { withYear: true })

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
      <div
        className="px-4 flex items-center justify-between"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)', paddingBottom: 8 }}
      >
        <Link
          href="/settings"
          className="flex items-center gap-1.5 bg-transparent border-0 cursor-pointer min-h-11 px-2 -ml-2 no-underline"
          style={{ color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 'var(--fs-sm)' }}
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </Link>

        <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {t.title}
        </div>

        <div className="w-[64px]" aria-hidden="true" />
      </div>

      <div className="px-5 pt-6 pb-3">
        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{t.intro}</p>
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
                    style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
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
