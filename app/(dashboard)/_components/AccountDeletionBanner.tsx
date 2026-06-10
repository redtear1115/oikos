'use client'

import { useState } from 'react'
import { cancelAccountDeletion } from '@/actions/account'
import { useTranslations } from '@/lib/i18n/client'

const GRACE_DAYS = 14

export function AccountDeletionBanner({ requestedAt }: { requestedAt: string }) {
  const t = useTranslations()
  const [pending, setPending] = useState(false)

  const removalDate = new Date(
    new Date(requestedAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toLocaleDateString()

  async function handleCancel() {
    setPending(true)
    await cancelAccountDeletion().catch(() => {})
    window.location.reload()
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--hairline)', color: 'var(--ink)' }}
      role="status"
    >
      <span>{t.accountDeletionBanner.message.replace('{date}', removalDate)}</span>
      <button
        type="button"
        onClick={handleCancel}
        disabled={pending}
        className="shrink-0 text-sm font-medium underline disabled:opacity-50 cursor-pointer"
        style={{ color: 'var(--destructive)' }}
      >
        {t.accountDeletionBanner.cancel}
      </button>
    </div>
  )
}
