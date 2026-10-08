'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { HeaderOverflowMenu } from '@/app/(dashboard)/assets/_components/shared/HeaderOverflowMenu'
import { useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { deactivateOutingParticipant, releaseOutingSlot } from '@/actions/outing'

interface Props {
  outingId: string
  participant: { id: string; displayName: string }
  /** Offer 釋放: claimed by cookie, not bound to an account (see participantClaim). */
  canRelease: boolean
  /** Offer 移除: still active, and not one of the ledger's own members. */
  canRemove: boolean
}

type Pending = 'release' | 'remove' | null

/**
 * The "⋯" on a participant row (#1558, members only): 釋放 a claimed slot so
 * the friend can claim it again from a new device, or 移除 someone from new
 * expenses. Both go through a confirm; a server refusal (e.g. the slot got
 * bound to an account meanwhile → outing_slot_bound) shows in the dialog.
 * Renders nothing when neither action applies.
 */
export function ParticipantActions({ outingId, participant, canRelease, canRemove }: Props) {
  const t = useTranslations()
  const to = t.outing
  const router = useRouter()
  const [confirming, setConfirming] = useState<Pending>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  if (!canRelease && !canRemove) return null

  const open = (which: Pending) => { setError(''); setConfirming(which) }
  const items = [
    ...(canRelease ? [{ label: to.participant.release, onSelect: () => open('release') }] : []),
    ...(canRemove ? [{ label: to.participant.remove, onSelect: () => open('remove') }] : []),
  ]

  const handleConfirm = () => {
    const which = confirming
    setError('')
    startTransition(async () => {
      try {
        const input = { outingId, participantId: participant.id }
        unwrapAction(which === 'release' ? await releaseOutingSlot(input) : await deactivateOutingParticipant(input))
        setConfirming(null)
        router.refresh()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const copy = confirming === 'remove'
    ? { title: to.participant.removeConfirmTitle, body: to.participant.removeConfirmBody, cta: to.participant.remove }
    : { title: to.participant.releaseConfirmTitle, body: to.participant.releaseConfirmBody, cta: to.participant.release }

  return (
    <>
      <HeaderOverflowMenu
        ariaLabel={to.participant.actionsAria.replace('{name}', participant.displayName)}
        items={items}
      />
      <ConfirmModal
        open={confirming !== null}
        title={copy.title.replace('{name}', participant.displayName)}
        description={copy.body}
        confirmLabel={copy.cta}
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={handleConfirm}
      >
        {error && <p role="alert" className="text-sm mb-4 text-[var(--debit-text)]">{error}</p>}
      </ConfirmModal>
    </>
  )
}
