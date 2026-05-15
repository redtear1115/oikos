'use client'

import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  open: boolean
  title: string
  canSave: boolean
  pending: boolean
  bottomSaveLabel: string
  error: string
  onClose: () => void
  onSave: () => void
  children: React.ReactNode
  /**
   * When true, both save buttons (top-right + bottom) render in destructive
   * styling — for sheets that confirm irreversible actions like ending a trip
   * or deleting an asset.
   */
  destructive?: boolean
}

// Shared sheet chrome: backdrop, slide-up container with fixed height,
// grabber, header (cancel / title / save), scrolling content area with the
// caller-provided body, error display, and bottom save. Delete affordance is
// rendered by each body via DeleteConfirmFlow (only in edit mode).
export function SheetShell({
  open,
  title,
  canSave,
  pending,
  bottomSaveLabel,
  error,
  onClose,
  onSave,
  children,
  destructive = false,
}: Props) {
  const t = useTranslations()
  const accentColor = destructive ? 'var(--destructive)' : 'var(--accent)'
  const bottomBg = destructive ? 'var(--btn-destructive-bg)' : 'var(--accent)'
  const bottomShadow = destructive
    ? '0 2px 6px rgba(184, 90, 72, 0.3)'
    : '0 2px 6px rgba(224,136,86,0.3)'
  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed left-1/2 bottom-0 z-[100] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          // Fix the sheet height so toggling between types (long form like 車/保險 vs short like 植物/房子)
          // doesn't make the sheet jump. Inner content scrolls when needed.
          height: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgba(31,27,22,0.18)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose} className="bg-transparent border-0 text-body cursor-pointer p-1" style={{ color: 'var(--ink-2)' }}>
            {t.common.cancel}
          </button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            {title}
          </div>
          <button
            onClick={onSave}
            disabled={!canSave}
            className="bg-transparent border-0 text-body font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{ color: canSave ? accentColor : 'var(--ink-3)' }}
          >
            {pending ? t.common.saving : t.common.save}
          </button>
        </div>

        <div className="overflow-auto flex-1 px-5 pt-2 pb-6">
          {children}

          {error && (
            <div className="mt-3 text-sm" style={{ color: 'var(--error, #c0392b)' }}>
              {error}
            </div>
          )}

          {/* Primary save at the bottom of the form so a long fill-out
              (車 / 保險) can submit without scrolling back to the top-right
              save. The top-right save stays as a secondary affordance. */}
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="mt-6 w-full h-[46px] rounded-xl border-0 text-white font-semibold text-sm tracking-[0.3px] cursor-pointer disabled:cursor-default"
            style={{
              background: canSave ? bottomBg : 'var(--ink-3)',
              opacity: canSave ? 1 : 0.55,
              boxShadow: canSave ? bottomShadow : 'none',
            }}
          >
            {pending ? t.common.saving : bottomSaveLabel}
          </button>
        </div>
      </div>
    </>
  )
}
