'use client'

import { useCallback, useState, useTransition } from 'react'
import { describeError } from '@/lib/errors'
import { useTranslations } from '@/lib/i18n/client'
import type { ActionResult } from '@/lib/action-errors'

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
   *
   * `e` is the returned `ActionFailure` for an expected server error, and the
   * caught exception for a network / unexpected one. Branch on it with
   * `isActionError(e, 'pending_expense_not_found')` — never on `msg`, which is
   * already localized and would only match in the locale the pattern was
   * written in (#1156).
   */
  onError?: (msg: string, e: unknown) => boolean | void
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
 *
 * `op` returns the action's `ActionResult` rather than unwrapping it (#1223):
 * an expected failure arrives as a value, so the race branches below see the
 * code itself. The `catch` is still load-bearing — offline and genuinely
 * unexpected server errors never became return values.
 */
export function useSheetMutation() {
  const t = useTranslations()
  const actionErrors = t.errors.actions
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const runMutation = useCallback(
    (op: () => Promise<ActionResult<unknown>>, opts: RunMutationOptions) => {
      const fail = (e: unknown) => {
        const msg = describeError(e, opts.fallbackMsg, opts.offlineMsg, actionErrors)
        if (opts.onError?.(msg, e)) return
        setError(msg)
      }
      startTransition(async () => {
        try {
          const result = await op()
          if (!result.ok) {
            fail(result)
            return
          }
          opts.onSuccess?.()
        } catch (e) {
          fail(e)
        }
      })
    },
    [actionErrors],
  )

  /**
   * Delete-button helper: clears `confirmingDelete` then dispatches the op via
   * `runMutation`. Callers still own the `if (!isEdit) return` guard since
   * "is this an edit" is a sheet-level concept.
   */
  const performDelete = useCallback(
    (op: () => Promise<ActionResult<unknown>>, opts: RunMutationOptions) => {
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
