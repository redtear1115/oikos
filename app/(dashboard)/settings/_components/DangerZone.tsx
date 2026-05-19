'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/client'
import { cancelSwap, confirmSwap } from '@/actions/membership'
import { formatDateAbsolute } from '@/lib/format-date'
import { describeMembershipError } from '@/lib/membership-errors'
import { LeaveGroupFlow } from './LeaveGroupFlow'

export interface PendingSwap {
  /** 'self' = viewer proposed; 'partner' = partner proposed. */
  by: 'self' | 'partner'
  expiresAt: Date
}

interface Props {
  viewerIsMemberA: boolean
  viewerName: string
  partnerName: string
  /** Signed balance from member_a's POV. */
  groupBalance: number
  pendingSwap: PendingSwap | null
  /** User's current locale, used for date formatting in the pending banner. */
  locale: string
}

export function DangerZone({
  viewerIsMemberA,
  viewerName,
  partnerName,
  groupBalance,
  pendingSwap,
  locale,
}: Props) {
  const t = useTranslations()
  const dz = t.settings.dangerZone
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <div className="px-4 mt-2 mb-5">
      <div className="text-xs font-medium px-1 mb-2" style={{ color: 'var(--ink-3)' }}>
        {dz.sectionTitle}
      </div>

      {pendingSwap && (
        <SwapPendingBanner
          pending={pendingSwap}
          partnerName={partnerName}
          locale={locale}
          onChanged={() => router.refresh()}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--destructive-soft)',
          color: 'var(--destructive)',
        }}
      >
        <div className="text-sm font-medium">{dz.leaveCta}</div>
        <div className="text-sm">›</div>
      </button>

      <LeaveGroupFlow
        open={open}
        onClose={() => setOpen(false)}
        viewerIsMemberA={viewerIsMemberA}
        viewerName={viewerName}
        partnerName={partnerName}
        groupBalance={groupBalance}
      />
    </div>
  )
}

function SwapPendingBanner({
  pending,
  partnerName,
  locale,
  onChanged,
}: {
  pending: PendingSwap
  partnerName: string
  locale: string
  onChanged: () => void
}) {
  const t = useTranslations()
  const dz = t.settings.dangerZone
  const banner = dz.swapBanner
  const [busy, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const dateLabel = formatDateAbsolute(pending.expiresAt.toISOString(), locale)

  const headline = pending.by === 'self'
    ? banner.yourProposal
    : banner.partnerProposal.replace('{partner}', partnerName)

  const run = (fn: () => Promise<unknown>) => () => {
    setErrorMsg(null)
    startTransition(async () => {
      try {
        await fn()
        onChanged()
      } catch (e) {
        setErrorMsg(banner.errorPrefix + describeMembershipError(e, dz.errors, t.common.offlineError))
      }
    })
  }

  return (
    <div
      className="rounded-card px-5 py-4 flex flex-col gap-3"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
      }}
    >
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{headline}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
          {banner.expiresOn.replace('{date}', dateLabel)}
        </div>
      </div>
      <div className="flex gap-2">
        {pending.by === 'self' ? (
          <button
            type="button"
            onClick={run(cancelSwap)}
            disabled={busy}
            className="flex-1 h-10 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{
              background: 'var(--btn-secondary-bg)',
              color: 'var(--btn-secondary-text)',
              border: '1px solid var(--btn-secondary-border)',
            }}
          >
            {busy ? banner.processing : banner.cancelCta}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={run(cancelSwap)}
              disabled={busy}
              className="flex-1 h-10 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--btn-secondary-bg)',
                color: 'var(--btn-secondary-text)',
                border: '1px solid var(--btn-secondary-border)',
              }}
            >
              {busy ? banner.processing : banner.rejectCta}
            </button>
            <button
              type="button"
              onClick={run(confirmSwap)}
              disabled={busy}
              className="flex-1 h-10 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              {busy ? banner.processing : banner.acceptCta}
            </button>
          </>
        )}
      </div>
      {errorMsg && (
        <div className="text-xs" style={{ color: 'var(--debit)' }} role="alert">{errorMsg}</div>
      )}
    </div>
  )
}
