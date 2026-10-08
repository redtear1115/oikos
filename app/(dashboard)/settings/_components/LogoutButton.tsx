'use client'

import { useState } from 'react'
import { signOut } from '@/actions/auth'
import { clearStoredPushToken, readStoredPushToken } from '@/lib/pushTokenStorage'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { clearDynamicCache } from '@/lib/offline/swControl'
import { useTranslations } from '@/lib/i18n/client'

export function LogoutButton() {
  const t = useTranslations()
  // Plain useState instead of useTransition: React transitions swallow the
  // NEXT_REDIRECT throw from `signOut()`'s server-side `redirect()` call,
  // which left the browser visually stuck on /settings even though the
  // server's 303 fired correctly. With plain state, the redirect propagates
  // normally; the window.location fallback in handleConfirm catches the
  // pathological case where the soft nav still doesn't take.
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    setConfirming(false)
    setPending(true)
    // Drop cached HTML so the next user on this device can't see the
    // previous user's pages. Toggle preference / app shell precache are
    // kept (they're not user-scoped).
    await clearDynamicCache().catch(() => {})
    // #1605 / #1617 — ONE server action: signOut drops this device's push
    // registration (bounded at 2 s server-side, failures swallowed) and then
    // signs out. Do not split the delete back into a second action awaited
    // first: Next.js runs server actions one at a time, so signOut would
    // queue behind it and a slow delete would hold 登出 up. A failed sign-out
    // falls through to the hard navigation below. The stored token is
    // forgotten once the action has returned or failed, never before it.
    await signOut(readStoredPushToken() ?? undefined).catch(() => {})
    clearStoredPushToken()
    // Safety net: if signOut()'s soft nav somehow didn't take, force a hard
    // navigation so the user is never visually stranded on /settings.
    window.location.replace('/')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="w-full h-12 rounded-bubble border-0 bg-transparent text-sm font-medium cursor-pointer disabled:opacity-50"
        style={{ color: 'var(--destructive)' }}
      >
        {pending ? t.logoutButton.pending : t.logoutButton.label}
      </button>
      <ConfirmModal
        open={confirming}
        title={t.logoutButton.title}
        description={t.logoutButton.description}
        confirmLabel={t.logoutButton.label}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
