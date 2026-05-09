'use client'

import { useEffect, useState, useTransition } from 'react'
import { localTodayISO } from '@/lib/local-date'

interface CommonInitial {
  id: string
  amount: number
  intervalMonths: number
  dayOfMonth: number
  startsOn: string
  endsOn: string | null
  pausedAt: Date | null
}

interface RuleActions {
  pauseRule: (id: string) => Promise<void>
  resumeRule: (id: string) => Promise<void>
  softDeleteRule: (id: string) => Promise<void>
}

interface ErrorMessages {
  operationFailed: string
  deleteFailed: string
}

export interface UseRecurringRuleFormOptions {
  open: boolean
  initial?: CommonInitial
  actions: RuleActions
  errorMessages: ErrorMessages
  onMutated: () => void
  onClose: () => void
}

/**
 * Shared state + lifecycle for RecurringRuleSheet (expense/income).
 *
 * Owns the fields that appear in both sheets (amount, interval, day-of-month,
 * date range) and the pause/resume/delete handlers. Each sheet keeps its
 * domain-specific state (paidBy/splitType/description for expense;
 * recipientId/source for income) locally and supplies its own handleSave.
 */
export function useRecurringRuleForm({
  open,
  initial,
  actions,
  errorMessages,
  onMutated,
  onClose,
}: UseRecurringRuleFormOptions) {
  const [amount, setAmount] = useState(0)
  const [intervalMonths, setIntervalMonths] = useState<1 | 3 | 6 | 12>(1)
  const [dayOfMonth, setDayOfMonth] = useState(new Date().getDate())
  const [startsOn, setStartsOn] = useState(localTodayISO())
  const [endsOn, setEndsOn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  // Reset / prefill on open. Caller handles its own domain-specific reset
  // separately (it depends on viewer/partner/isSolo which the hook doesn't see).
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(initial.amount)
      setIntervalMonths(initial.intervalMonths as 1 | 3 | 6 | 12)
      setDayOfMonth(initial.dayOfMonth)
      setStartsOn(initial.startsOn)
      setEndsOn(initial.endsOn ?? '')
    } else {
      setAmount(0)
      setIntervalMonths(1)
      setDayOfMonth(new Date().getDate())
      setStartsOn(localTodayISO())
      setEndsOn('')
    }
    setError(null)
    setConfirmingDelete(false)
  }, [open, initial])

  const handlePauseResume = () => {
    if (!initial?.id) return
    const isPaused = !!initial.pausedAt
    startTransition(async () => {
      try {
        if (isPaused) await actions.resumeRule(initial.id)
        else await actions.pauseRule(initial.id)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : errorMessages.operationFailed)
      }
    })
  }

  const handleDelete = () => {
    if (!initial?.id) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await actions.softDeleteRule(initial.id)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : errorMessages.deleteFailed)
      }
    })
  }

  /**
   * Wraps a submit closure with the standard transition + try/catch + close
   * behavior used by both sheets' handleSave. Caller builds the payload + picks
   * createRule vs updateRule inside `submitFn`.
   */
  const runSubmit = (submitFn: () => Promise<unknown>, fallbackErrorMessage: string) => {
    startTransition(async () => {
      try {
        await submitFn()
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : fallbackErrorMessage)
      }
    })
  }

  return {
    amount,
    setAmount,
    intervalMonths,
    setIntervalMonths,
    dayOfMonth,
    setDayOfMonth,
    startsOn,
    setStartsOn,
    endsOn,
    setEndsOn,
    error,
    setError,
    confirmingDelete,
    setConfirmingDelete,
    pending,
    isPaused: !!initial?.pausedAt,
    handlePauseResume,
    handleDelete,
    runSubmit,
  }
}
