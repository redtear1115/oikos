'use client'

import { useState, useTransition } from 'react'
import { signOut } from '@/actions/auth'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { clearDynamicCache } from '@/lib/offline/swControl'
import { useTranslations } from '@/lib/i18n/client'

export function LogoutButton() {
  const t = useTranslations()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="w-full h-12 rounded-[14px] border-0 bg-transparent text-sm font-medium cursor-pointer disabled:opacity-50"
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
        onConfirm={() => {
          setConfirming(false)
          startTransition(async () => {
            // Drop cached HTML so the next user on this device can't see the
            // previous user's pages. Toggle preference / app shell precache
            // are kept (they're not user-scoped).
            await clearDynamicCache().catch(() => {})
            await signOut()
          })
        }}
      />
    </>
  )
}
