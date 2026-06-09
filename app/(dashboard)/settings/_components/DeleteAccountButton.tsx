'use client'

import { useState } from 'react'
import { requestAccountDeletion } from '@/actions/account'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { clearDynamicCache } from '@/lib/offline/swControl'
import { useTranslations } from '@/lib/i18n/client'

/**
 * Settings danger-zone entry to delete the account. Mirrors LogoutButton:
 * plain useState (not useTransition) so the server action's redirect
 * propagates; window.location fallback guards a stranded soft-nav.
 * requestAccountDeletion() flags the account and signs out — the actual
 * deletion runs server-side after a 14-day grace window.
 */
export function DeleteAccountButton() {
  const t = useTranslations()
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    setConfirming(false)
    setPending(true)
    await clearDynamicCache().catch(() => {})
    await requestAccountDeletion().catch(() => {})
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
        {pending ? t.deleteAccountButton.pending : t.deleteAccountButton.label}
      </button>
      <ConfirmModal
        open={confirming}
        title={t.deleteAccountButton.title}
        description={t.deleteAccountButton.description}
        confirmLabel={t.deleteAccountButton.label}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
