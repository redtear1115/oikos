'use client'

import { useState, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { createInvite } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'

/**
 * Shown on the dashboard hero slot when the viewer is in a solo group
 * (member_b = null). Clicking the CTA generates an invite URL on demand
 * and pushes it through the Web Share API (or clipboard fallback).
 */
export function SoloBanner() {
  const { group } = useMember()
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleInvite = () => {
    setError(null)
    startTransition(async () => {
      try {
        const url = await createInvite(group.id)
        const result = await shareInviteLink(url)
        if (result === 'copied') {
          setToast('已複製連結')
          setTimeout(() => setToast(null), 2000)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  return (
    <div className="px-5 pt-6 pb-5">
      <div
        className="flex items-center gap-[14px] p-4 rounded-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <Avatar who="T" initial="?" src={null} size={44} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>
            還在等對方加入
          </div>
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
            傳連結邀請他
          </div>
        </div>
        <button
          onClick={handleInvite}
          disabled={pending}
          className="h-9 px-4 rounded-full border-0 text-white text-sm font-medium cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {pending ? '產生中…' : '傳送邀請'}
        </button>
      </div>

      {toast && (
        <div className="mt-3 text-xs text-center" style={{ color: 'var(--ink-2)' }}>
          {toast}
        </div>
      )}
      {error && (
        <div className="mt-3 text-xs text-center" style={{ color: 'var(--debit)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
