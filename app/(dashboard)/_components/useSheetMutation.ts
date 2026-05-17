'use client'

import { useCallback, useState, useTransition } from 'react'
import { describeError } from '@/lib/errors'

interface RunMutationOptions {
  /** Fallback message when `describeError` can't resolve a specific one. */
  fallbackMsg: string
  /** Offline-specific message (passed through to `describeError`). */
  offlineMsg: string
  /** Called after the op resolves successfully, before any state cleanup. */
  onSuccess?: () => void
  /**
   * Custom error branch. Return `true` to suppress the default `setError`
   * call — use this for race-resolution paths that handle the message
   * differently (e.g. AddSheet / IncomeSheet `editAndConfirmPending`:
   * "partner already confirmed this pending" → close sheet + toast instead
   * of surfacing an inline error).
   */
  onError?: (msg: string) => boolean | void
}

/**
 * Common mutation + error + delete-confirm state for sheets that wrap a
 * single async write (#512 PR 4). Used by AddSheet and IncomeSheet —
 * TripSheet has a different error shape (nullable + composed with synchronous
 * validation) and doesn't expose a delete affordance, so it doesn't use this.
 *
 * The hook intentionally does NOT manage amount / date / domain state; those
 * stay with each sheet because the open-reset logic, prefill, and validation
 * rules differ enough that a shared shape would force every branch through
 * one consumer interface.
 */
export function useSheetMutation() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const runMutation = useCallback(
    (op: () => Promise<void>, opts: RunMutationOptions) => {
      startTransition(async () => {
        try {
          await op()
          opts.onSuccess?.()
        } catch (e) {
          const msg = describeError(e, opts.fallbackMsg, opts.offlineMsg)
          if (opts.onError?.(msg)) return
          setError(msg)
        }
      })
    },
    [],
  )

  /**
   * Delete-button helper: clears `confirmingDelete` then dispatches the op via
   * `runMutation`. Callers still own the `if (!isEdit) return` guard since
   * "is this an edit" is a sheet-level concept.
   */
  const performDelete = useCallback(
    (op: () => Promise<void>, opts: RunMutationOptions) => {
      setConfirmingDelete(false)
      runMutation(op, opts)
    },
    [runMutation],
  )

  return {
    pending,
    error,
    setError,
    confirmingDelete,
    setConfirmingDelete,
    runMutation,
    performDelete,
  }
}
