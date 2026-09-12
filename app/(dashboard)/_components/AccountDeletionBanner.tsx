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
    // `shell-top-strip` (globals.css) is what makes this reachable on a notched
    // phone: as the first element in the dashboard shell, the banner absorbs the
    // status-bar inset and cancels it for the page header below. (#1021)
    <div className="shell-top-strip flex items-center justify-between gap-3 px-5 text-sm bg-surface text-ink border-b border-hairline">
      {/* The live region is the sentence only. A status region that also wraps
          the control tends to get re-announced as one blob on re-render, and the
          escape hatch out of a destructive countdown should read as a button. */}
      <span role="status">{t.accountDeletionBanner.message.replace('{date}', removalDate)}</span>
      <button
        type="button"
        onClick={handleCancel}
        disabled={pending}
        className="shrink-0 inline-flex items-center min-h-11 px-2 -mr-2 text-sm font-medium underline disabled:opacity-50 cursor-pointer bg-transparent border-0 text-destructive"
      >
        {t.accountDeletionBanner.cancel}
      </button>
    </div>
  )
}
