'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { softDeleteAsset } from '@/actions/asset'

/**
 * Shared state + helpers for every *SheetBody under AssetSheet/ (#512 PR 5).
 *
 * Every body used to re-declare the same scaffolding inline:
 *   - useState for name + notes + error
 *   - useTransition for pending
 *   - useRef for the name input (focus-on-open)
 *   - useEffect that resets all fields when `open` flips true, plus a 350ms
 *     setTimeout to focus the name input
 *   - A `performDelete` handler that wraps softDeleteAsset in startTransition
 *     + describeError → setError + onMutated('deleted') + onClose
 *   - A `runMutation` wrapper that does the same try/catch dance for save
 *
 * This hook owns all of that. Bodies pass a `resetDomain` callback that the
 * hook invokes inside its open-reset effect after the common fields settle —
 * so each body's domain-specific state (e.g. plantSpecies, insAnnualPremium)
 * is still owned by the body but reset semantics stay co-located with the
 * common reset.
 *
 * The hook does NOT manage domain state; that stays with each body so the
 * shape of e.g. CarSheetBody is still local-and-readable.
 */

interface CommonInitial {
  id: string
  name: string
  notes?: string | null
}

interface UseAssetSheetCommonOptions<I extends CommonInitial> {
  open: boolean
  initial: I | undefined
  onClose: () => void
  onMutated?: (kind: 'saved' | 'deleted') => void
  /**
   * Called inside the open-reset useEffect, after common fields reset. Bodies
   * use this to reset their own domain state (species / address / kind / etc.)
   * in lockstep with the common name + notes + error reset. Captured fresh
   * each render via a ref, so referencing body-local setters is safe.
   */
  resetDomain?: () => void
}

export function useAssetSheetCommon<I extends CommonInitial>(
  opts: UseAssetSheetCommonOptions<I>,
) {
  const { open, initial, onClose, onMutated, resetDomain } = opts
  const isEdit = !!initial
  const t = useTranslations()
  const ts = t.assetSheet

  const [name, setName] = useState(initial?.name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Keep latest resetDomain in a ref so the open-reset effect can stay on
  // [open, initial] without re-running every render (the callback identity
  // changes each render because it closes over body-local setters).
  const resetDomainRef = useRef(resetDomain)
  useEffect(() => {
    resetDomainRef.current = resetDomain
  })

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setNotes(initial?.notes ?? '')
    setError('')
    resetDomainRef.current?.()
    const id = setTimeout(() => nameInputRef.current?.focus(), 350)
    return () => clearTimeout(id)
    // resetDomain intentionally NOT in deps — see resetDomainRef above.
  }, [open, initial])

  /** Wrap any async save / mutate operation with startTransition + error handling. */
  const runMutation = useCallback(
    (op: () => Promise<void>, onSuccess?: () => void) => {
      startTransition(async () => {
        try {
          await op()
          onSuccess?.()
        } catch (e) {
          setError(describeError(e, t.common.error, t.common.offlineError))
        }
      })
    },
    [t.common.error, t.common.offlineError],
  )

  /** Soft-delete the current asset. No-op in create mode. */
  const performDelete = useCallback(() => {
    if (!isEdit || !initial) return
    runMutation(
      async () => {
        await softDeleteAsset(initial.id)
      },
      () => {
        onMutated?.('deleted')
        onClose()
      },
    )
  }, [isEdit, initial, onMutated, onClose, runMutation])

  return {
    isEdit,
    name,
    setName,
    notes,
    setNotes,
    pending,
    error,
    setError,
    nameInputRef,
    t,
    ts,
    runMutation,
    performDelete,
  }
}
