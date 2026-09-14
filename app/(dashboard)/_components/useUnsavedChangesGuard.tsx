'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { ConfirmModal } from './ConfirmModal'

/**
 * Tracks whether a sheet's form differs from what it held right after it
 * opened (#1183). Returns a stable `isDirty()` getter — read it in event
 * handlers, not during render.
 *
 * `values` is everything the user can edit, as plain JSON-serialisable data.
 * Leave out UI-only state (open pickers, errors, loaded option lists), or
 * toggling a calendar counts as an edit.
 *
 * The baseline is "after the sheet's own reset", not "the first render with
 * `open`": sheets stay mounted and prefill in a `useEffect` on `open`, so the
 * opening render still shows the previous session's values. Capture runs two
 * commits after open — the first catches the reset, the second catches effects
 * that react to the reset (IncomeSheet clears the policy link when the
 * category changes). Nothing the user does can land in between.
 * Symptom if the baseline is taken too early: a sheet the user never touched
 * asks "discard?" on backdrop tap. Too late (e.g. on a timer): a fast first
 * keystroke becomes part of the baseline and that input is dropped silently.
 */
export function useDirtyCheck(open: boolean, values: unknown): () => boolean {
  const serialized = JSON.stringify(values)
  const latestRef = useRef(serialized)
  const baselineRef = useRef<string | null>(null)
  const [capturePass, setCapturePass] = useState(0)

  useEffect(() => {
    latestRef.current = serialized
  })

  useEffect(() => {
    baselineRef.current = null
    setCapturePass(open ? 1 : 0)
  }, [open])

  useEffect(() => {
    if (capturePass === 0) return
    baselineRef.current = latestRef.current
    if (capturePass === 1) setCapturePass(2)
  }, [capturePass])

  return useCallback(
    () => baselineRef.current !== null && latestRef.current !== baselineRef.current,
    [],
  )
}

/**
 * The dismiss half of the unsaved-changes guard. Wrap the sheet's *implicit*
 * close paths (backdrop tap, Escape, system Back) in `requestClose`; when
 * `isDirty()` is true it opens a discard confirmation instead of closing and
 * returns `false`, which tells useEscapeToClose to stay armed.
 *
 * Explicit closes — the sheet's 取消 button, a successful save — keep calling
 * `onClose` directly. Pressing 取消 is already a decision (pending product
 * confirmation on #1183).
 *
 * Render `confirm` anywhere; ConfirmModal portals to `document.body` and
 * stacks its focus trap above the sheet's.
 */
export function useUnsavedChangesGuard(
  open: boolean,
  onClose: () => void,
  isDirty: (() => boolean) | undefined,
): { requestClose: () => boolean; confirm: ReactNode } {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  const requestClose = () => {
    if (isDirty?.()) {
      setConfirming(true)
      return false
    }
    onClose()
    return true
  }

  // Only form sheets mount the modal, so sheets without `isDirty` don't need a
  // TranslationsProvider just for a dialog they can never show.
  const confirm = isDirty ? (
    <DiscardConfirm
      open={open && confirming}
      onKeepEditing={() => setConfirming(false)}
      onDiscard={() => {
        setConfirming(false)
        onClose()
      }}
    />
  ) : null

  return { requestClose, confirm }
}

function DiscardConfirm({
  open,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}) {
  const copy = useTranslations().common.unsavedChanges
  return (
    <ConfirmModal
      open={open}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.discard}
      cancelLabel={copy.keepEditing}
      onCancel={onKeepEditing}
      onConfirm={onDiscard}
    />
  )
}
