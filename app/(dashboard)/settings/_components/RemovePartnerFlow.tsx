'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'
import { removePartner } from '@/actions/membership'
import { describeMembershipError } from '@/lib/membership-errors'

interface Props {
  open: boolean
  onClose: () => void
  partnerName: string
}

/**
 * Single-card confirm sheet for member_a removing member_b (#1033) — the
 * involuntary counterpart to `LeaveGroupFlow`. Kept to one step rather than
 * that flow's 4-card walk-through: leaving is a decision two people talk
 * through together, removal is a decision one person is already making
 * about a partner who shouldn't be here. The type-to-confirm guard is enough
 * friction for an irreversible action without dramatizing it — going back to
 * solo is a complete state, not a punishment, so the copy just says what
 * will happen.
 */
export function RemovePartnerFlow({ open, onClose, partnerName }: Props) {
  const t = useTranslations()
  const dz = t.settings.dangerZone
  const flow = dz.removeFlow
  const router = useRouter()

  const [confirmInput, setConfirmInput] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      setConfirmInput('')
      setErrorMsg(null)
    }
  }, [open])

  const matched = confirmInput.trim() === flow.confirmText

  const handleClose = () => {
    if (pending) return
    onClose()
  }

  const handleRemove = () => {
    if (!matched) return
    setErrorMsg(null)
    startTransition(async () => {
      try {
        const { epochId } = await removePartner()
        // Mark the brand-new solo epoch so `PartnerLeftCard` renders its
        // removal variant instead of "{partner} has left" (#1121). The server
        // can't tell the two apart — removal closes the duo epoch and opens a
        // solo one, exactly like the partner walking out — so the distinction
        // only exists on the client that performed the removal. Same shape as
        // `LeaveGroupFlow`'s `futari_just_left_` flag.
        if (epochId) {
          try {
            window.localStorage.setItem('futari_partner_removed_' + epochId, '1')
          } catch {
            // Private-browsing storage failure: the card falls back to the
            // "partner left" copy. Not worth blocking the navigation.
          }
        }
        router.refresh()
        router.push('/dashboard')
      } catch (e) {
        setErrorMsg(describeMembershipError(e, dz.errors, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={handleClose} />
      {/* Same shell as LeaveGroupFlow, and deliberately identical rather than
          merely similar — the two flows share a failure mode and a fix (#1124).
          Layout box only: it spans the viewport and pays the safe-area insets
          so the centred panel can never grow into the notch. It stays
          `pointer-events: none` throughout, so clicks outside the panel fall
          through to SheetBackdrop, which owns dismiss-by-backdrop.

          `env()` directly, NOT `var(--safe-top)`: globals.css zeroes
          `--safe-top` for every sibling after the shell top stack, and this
          flow renders inside settings, i.e. inside those siblings. The token
          would read 0px here, so the allowance would silently be no allowance
          at all — the markup would look fixed and the ✕ would still land under
          the Dynamic Island. See DESIGN.md §4. */}
      <div
        className="fixed inset-0 z-modal flex items-center justify-center px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          pointerEvents: 'none',
        }}
      >
      <div
        className="w-full max-w-md max-h-full rounded-card flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms',
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-end px-5 pt-5 pb-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={pending}
            className="text-sm cursor-pointer disabled:opacity-50"
            style={{ background: 'transparent', border: 'none', color: 'var(--ink-3)' }}
            aria-label={dz.flow.close}
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6 overflow-y-auto flex-1">
          <h2
            className="text-base mb-3 leading-tight"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
          >
            {flow.title.replaceAll('{partner}', partnerName)}
          </h2>
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--ink-2)' }}>
            {flow.body.replaceAll('{partner}', partnerName)}
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5 mb-5" style={{ color: 'var(--ink-2)' }}>
            {flow.bullets.map((b, i) => (
              <li key={i}>{b.replaceAll('{partner}', partnerName)}</li>
            ))}
          </ul>

          <label className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
            <span>{flow.typePromptPrefix}</span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>{flow.confirmText}</span>
            <span>{flow.typePromptSuffix}</span>
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={flow.typePlaceholder}
            className="w-full h-12 rounded-xl px-3 text-sm mb-4 outline-none"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              border: '1px solid var(--hairline)',
            }}
          />

          {errorMsg && (
            <div
              className="mb-4 rounded-xl px-3 py-2 text-xs"
              style={{ background: 'var(--debit-soft)', color: 'var(--debit)' }}
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleRemove}
              disabled={!matched || pending}
              className="w-full h-12 rounded-bubble text-sm font-medium cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--btn-destructive-bg)', color: 'var(--btn-destructive-text)' }}
            >
              {pending ? flow.removing : flow.removeButton}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={pending}
              className="w-full h-12 rounded-bubble text-sm font-medium cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--btn-secondary-bg)',
                color: 'var(--btn-secondary-text)',
                border: '1px solid var(--btn-secondary-border)',
              }}
            >
              {flow.cancel}
            </button>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
