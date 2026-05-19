'use client'

interface Props {
  onBack?: () => void
  onNext?: () => void
  backLabel?: string
  nextLabel?: string
  /** When true, both buttons are disabled (e.g. during a submit). */
  loading?: boolean
  /** When true, only the next button is disabled (e.g. nothing to submit). */
  disabled?: boolean
}

export function WizardNavButtons({
  onBack,
  onNext,
  backLabel,
  nextLabel,
  loading = false,
  disabled = false,
}: Props) {
  return (
    <div className="flex gap-2">
      {backLabel && (
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 h-11 rounded-xl text-sm cursor-pointer disabled:cursor-default disabled:opacity-50"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            color: 'var(--ink-2)',
          }}
        >
          {backLabel}
        </button>
      )}
      {nextLabel && (
        <button
          type="button"
          onClick={onNext}
          disabled={loading || disabled}
          className="flex-[1.4] h-11 rounded-xl text-sm text-white cursor-pointer disabled:cursor-default disabled:opacity-50"
          style={{ background: 'var(--btn-primary-bg)' }}
        >
          {nextLabel}
        </button>
      )}
    </div>
  )
}
