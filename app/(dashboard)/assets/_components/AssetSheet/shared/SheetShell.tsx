'use client'

import { useState } from 'react'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'
import { HeaderOverflowMenu } from './HeaderOverflowMenu'

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
  /** Unsaved-input check (see SheetFrame `isDirty`, #1183). */
  isDirty?: () => boolean
  /**
   * Soft-deletes the asset (edit mode only). When present, a "⋯" menu
   * appears in the header; the entry point stays plain — the destructive
   * moment is the confirm dialog it opens, not the menu row (#1325).
   */
  onDelete?: () => void
  deletePending?: boolean
  /** Current name, interpolated into the delete confirm's copy. */
  assetName?: string
  /**
   * Which delete copy to use: a plain-named prompt for things (car / house /
   * insurance / generic item) vs a softer one for child / pet / plant.
   * Both state the same truth: past expenses stay in the ledger and are not
   * deleted with the asset — `softDeleteAsset` only ever sets `deletedAt`.
   *
   * **Retracted (#1325):** this comment used to add "they just stop being
   * attributed to this aibutsu", and the shipped copy said so too. It is not
   * true. `monthlyStatsByAsset` (`lib/db/queries/transactions.ts`) LEFT JOINs
   * Assets without filtering `deleted_at` — deliberately, so a deleted
   * aibutsu keeps its own name in the records breakdown instead of collapsing
   * into 未命名. So its past expenses stay grouped, summed and drillable under
   * that name, one tap from the records page. Don't reintroduce the claim in
   * copy or here without changing that query first.
   */
  deleteVariant?: 'item' | 'lifeEntity'
}

// Shared sheet chrome: backdrop, slide-up container with fixed height,
// grabber, header (cancel / title / ⋯ menu / save), scrolling content area
// with the caller-provided body, error display, and bottom save.
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
  isDirty,
  onDelete,
  deletePending = false,
  assetName = '',
  deleteVariant = 'item',
}: Props) {
  const t = useTranslations()
  const ts = t.assetSheet
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const accentColor = destructive ? 'var(--destructive)' : 'var(--accent)'
  // Bottom commit follows the system's primary/danger vocabulary (ink fill,
  // or destructive fill for irreversible confirms) — never the ember accent,
  // and flat (no shadow): DESIGN.md's Flat-By-Default Rule, an in-flow button
  // gets no drop shadow (#1322).
  const bottomBg = destructive ? 'var(--btn-destructive-bg)' : 'var(--btn-primary-bg)'
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      isDirty={isDirty}
      ariaLabel={title}
      // Fix the sheet height so toggling between types (long form like 車/保險 vs short like 植物/房子)
      // doesn't make the sheet jump. Inner content scrolls when needed.
      heightMode="fixed"
      heightDvh={92}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
          {t.common.cancel}
        </Button>
        <div className="text-base font-medium tracking-wide" style={{ color: 'var(--ink)' }}>
          {title}
        </div>
        <div className="flex items-center gap-1">
          {onDelete && (
            <HeaderOverflowMenu
              ariaLabel={ts.menu.ariaLabel}
              items={[{ label: t.common.delete, onSelect: () => setConfirmingDelete(true) }]}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={!canSave}
            className="px-2 font-medium"
            style={{ color: canSave ? accentColor : 'var(--ink-3)' }}
          >
            {pending ? t.common.saving : t.common.save}
          </Button>
        </div>
      </div>

      <div className="overflow-auto flex-1 px-5 pt-2 pb-6">
        {children}

        {error && (
          <div
            className="mt-3 text-sm"
            style={{ color: 'var(--debit-text)' }}
            role="alert"
          >
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
          className="mt-6 w-full h-12 rounded-bubble border-0 font-medium text-sm tracking-[0.3px] cursor-pointer disabled:cursor-default"
          style={{
            background: canSave ? bottomBg : 'var(--ink-3)',
            color: 'var(--btn-primary-text)',
            opacity: canSave ? 1 : 0.55,
          }}
        >
          {pending ? t.common.saving : bottomSaveLabel}
        </button>
      </div>

      {onDelete && (
        <ConfirmModal
          open={confirmingDelete}
          // The sheet's live name field, so the dialog matches what is on
          // screen — but it can be empty (saving is gated on a name, deleting
          // is not), and 「」要從愛物移除嗎？ reads like a bug. Fall back then.
          title={ts.deleteConfirm[deleteVariant].title.replace(
            '{name}',
            assetName.trim() || ts.deleteConfirm.unnamed,
          )}
          description={ts.deleteConfirm.description}
          confirmLabel={ts.deleteConfirm.confirmLabel}
          pending={deletePending}
          onConfirm={() => { setConfirmingDelete(false); onDelete() }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </SheetFrame>
  )
}
