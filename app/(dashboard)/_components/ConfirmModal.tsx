'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'
import { useFocusTrap } from './useFocusTrap'

interface Props {
  open: boolean
  title: string
  /** Optional supporting copy under the title. */
  description?: string
  /** Confirm-button label. Defaults to `t.common.confirm` (e.g. "確認"). */
  confirmLabel?: string
  /** Cancel-button label. Defaults to `t.common.cancel` (e.g. "取消"). */
  cancelLabel?: string
  /** Confirm-button styled with destructive color (red). Defaults true since this
   *  modal exists primarily for destructive flows. */
  destructive?: boolean
  /** Disable the confirm button while a parent transition is pending. */
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Brand-styled replacement for native `confirm()`. Use for destructive actions
 * (delete a record, log out) where users should pause-and-confirm.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  pending = false,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTranslations()
  const finalConfirmLabel = confirmLabel ?? t.common.confirm
  const finalCancelLabel = cancelLabel ?? t.common.cancel

  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Traps Tab inside the panel while open, and restores focus to the trigger
  // on close (see useFocusTrap.ts). Declared before the focus-on-open effect
  // below so its effect runs first and captures `previouslyFocused` while
  // focus is still on the trigger — the effect after this one is the thing
  // that moves focus away from it.
  useFocusTrap(open, panelRef)

  // Move focus into the panel on open. Focuses Cancel (not Confirm) so a
  // stray Enter from a fast typist can't fire the destructive action.
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
  }, [open])

  // Drives the fade-in. The panel isn't in the DOM at all while closed (see
  // below), so on open it first renders at opacity 0, then flips to 1 on the
  // next frame — giving the browser a starting frame to transition *from*.
  // Skipping straight to opacity 1 would skip the fade entirely.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!open) {
      setVisible(false)
      return
    }
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [open])

  return (
    <>
      <SheetBackdrop open={open} onClick={onCancel} />
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          className="fixed left-1/2 top-1/2 z-modal w-[calc(100%-48px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            boxShadow: '0 20px 60px rgba(31,27,22,0.18)',
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? 'auto' : 'none',
            transition: 'opacity 200ms',
          }}
        >
          <h2
            id={titleId}
            className="text-base mb-2 leading-tight"
            style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
          >
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="text-sm mb-5" style={{ color: 'var(--ink-2)' }}>
              {description}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="flex-1 h-11 rounded-xl border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
              style={{
                background: 'transparent',
                color: 'var(--ink-2)',
                border: '1px solid var(--hairline)',
              }}
            >
              {finalCancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="flex-1 h-11 rounded-xl border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
              style={{
                background: destructive ? 'var(--btn-destructive-bg)' : 'var(--btn-primary-bg)',
                color: destructive ? 'var(--btn-destructive-text)' : 'var(--btn-primary-text)',
              }}
            >
              {finalConfirmLabel}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
