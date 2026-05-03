'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { createInvite } from '@/actions/invite'
import { shareInviteLink } from '@/lib/share'

interface Props {
  /** Called when the user dismisses the banner via the × button. The parent owns the
   *  persisted dismissal state (typically localStorage) and is responsible for
   *  swapping in a fallback hero. */
  onDismiss?: () => void
}

/**
 * Shown on the dashboard hero slot when the viewer is in a solo group
 * (member_b = null). Clicking the CTA generates an invite URL on demand
 * and pushes it through the Web Share API (or clipboard fallback).
 */
export function SoloBanner({ onDismiss }: Props = {}) {
  const { group } = useMember()
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const handleInvite = () => {
    setError(null)
    startTransition(async () => {
      try {
        const url = await createInvite(group.id)
        const result = await shareInviteLink(url)
        // Always confirm — desktop share sheets (especially Chrome on macOS) can be
        // unobtrusive enough that users don't realise anything happened. Since the
        // helper always copies first, the URL is on the clipboard either way.
        setToast(result === 'shared' ? '已分享，連結也已複製' : '已複製連結')
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        toastTimerRef.current = setTimeout(() => setToast(null), 2000)
      } catch (e) {
        setError(e instanceof Error ? e.message : '發生錯誤')
      }
    })
  }

  return (
    <div className="px-5 pt-6 pb-5">
      <div className="flex items-start gap-[14px]">
        <Avatar who="T" initial="?" src={null} size={44} />
        <div className="flex-1 min-w-0 pt-[2px]">
          <div className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>還在等對方加入</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
            傳連結邀請他
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="關閉提示"
            className="self-center text-[22px] leading-none bg-transparent border-0 cursor-pointer p-1"
            style={{ color: 'var(--ink-3)' }}
          >
            ×
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleInvite}
        disabled={pending}
        className="mt-[18px] w-full h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer flex items-center justify-center disabled:opacity-50"
        style={{ background: 'var(--accent)' }}
      >
        {pending ? '產生中…' : '傳送邀請'}
      </button>

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
