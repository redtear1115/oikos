'use client'

import { useTranslations } from '@/lib/i18n/client'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import type { ReviewMember, ReviewPastMessage } from './ReviewClient'

export function PastMessages({
  messages,
  viewer,
  partner,
}: {
  messages: ReviewPastMessage[]
  viewer: ReviewMember
  partner: ReviewMember | null
}) {
  const t = useTranslations()
  const tr = t.monthlyReview
  const { viewerIsA } = useMember()

  function authorFor(memberId: string): ReviewMember | null {
    if (memberId === viewer.id) return viewer
    if (partner && memberId === partner.id) return partner
    return null
  }

  return (
    <div className="px-4 pt-4">
      <h3 className="text-xs font-medium tracking-[0.5px] mb-2 px-2" style={{ color: 'var(--ink-3)' }}>
        {tr.pastMessagesTitle}
      </h3>
      <div className="space-y-3">
        {messages.map((m) => {
          const author = authorFor(m.memberId)
          return (
            <div
              key={m.id}
              className="rounded-tile px-4 py-3 flex gap-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
            >
              <Avatar
                size={32}
                memberRole={whoToMemberRole(author?.id === viewer.id ? 'M' : 'T', viewerIsA)}
                initial={(author?.displayName?.[0] ?? '?').toUpperCase()}
                src={author?.avatarUrl ?? null}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium" style={{ color: 'var(--ink-2)' }}>
                  {author?.displayName ?? tr.pastMessageAuthorFallback}
                </div>
                <p
                  className="text-sm mt-1 whitespace-pre-wrap break-words"
                  style={{ color: 'var(--ink)' }}
                >
                  {m.body}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
