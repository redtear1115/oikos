'use client'

import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'

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
  return (
    <>
      <SheetBackdrop open={open} onClick={onCancel} />
      <div
        className="fixed left-1/2 top-1/2 z-modal w-[calc(100%-48px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          boxShadow: '0 20px 60px rgba(31,27,22,0.18)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 200ms',
        }}
      >
        <h2
          className="text-button mb-2 leading-tight"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {title}
        </h2>
        {description && (
          <p className="text-sm mb-5" style={{ color: 'var(--ink-2)' }}>
            {description}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
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
    </>
  )
}
