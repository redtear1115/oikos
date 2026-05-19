'use client'

import { useCallback, useMemo, useState } from 'react'

export interface UseWizardStepsOptions {
  /** Optional initial step (must be in `steps`). Defaults to the first step. */
  initialStep?: string
  /** Called when `goNext` is invoked on the last step. */
  onComplete?: () => void
}

export interface UseWizardStepsReturn<T extends string> {
  currentStep: T
  stepIndex: number
  totalSteps: number
  isFirst: boolean
  isLast: boolean
  /** 1-based progress: 1/N on the first step, N/N on the last. Useful for "Step X of Y" labels. */
  progress: number
  goNext: () => void
  goBack: () => void
  goTo: (step: T) => void
  reset: () => void
}

/**
 * Step machine for linear wizards. Holds the current step, exposes navigation
 * helpers, and fires `onComplete` when `goNext` is called from the last step.
 *
 * Step values must be unique. `goTo` is a no-op for unknown steps so callers
 * don't need to defensively guard against bad input.
 */
export function useWizardSteps<T extends string>(
  steps: readonly T[],
  options: UseWizardStepsOptions = {},
): UseWizardStepsReturn<T> {
  if (steps.length === 0) {
    throw new Error('useWizardSteps requires at least one step')
  }

  const { initialStep, onComplete } = options
  const firstStep = steps[0]
  const [currentStep, setCurrentStep] = useState<T>(
    (initialStep && (steps as readonly string[]).includes(initialStep) ? (initialStep as T) : firstStep),
  )

  const stepIndex = steps.indexOf(currentStep)
  const totalSteps = steps.length
  const isFirst = stepIndex <= 0
  const isLast = stepIndex === totalSteps - 1

  const goNext = useCallback(() => {
    const idx = steps.indexOf(currentStep)
    if (idx === -1) return
    if (idx === steps.length - 1) {
      onComplete?.()
      return
    }
    setCurrentStep(steps[idx + 1])
  }, [steps, currentStep, onComplete])

  const goBack = useCallback(() => {
    const idx = steps.indexOf(currentStep)
    if (idx <= 0) return
    setCurrentStep(steps[idx - 1])
  }, [steps, currentStep])

  const goTo = useCallback(
    (step: T) => {
      if ((steps as readonly string[]).includes(step)) {
        setCurrentStep(step)
      }
    },
    [steps],
  )

  const reset = useCallback(() => {
    setCurrentStep(firstStep)
  }, [firstStep])

  return useMemo(
    () => ({
      currentStep,
      stepIndex,
      totalSteps,
      isFirst,
      isLast,
      progress: stepIndex + 1,
      goNext,
      goBack,
      goTo,
      reset,
    }),
    [currentStep, stepIndex, totalSteps, isFirst, isLast, goNext, goBack, goTo, reset],
  )
}
