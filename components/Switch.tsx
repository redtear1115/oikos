'use client'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
}

export function Switch({ checked, onChange, disabled, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-50 transition-colors"
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: checked ? 'var(--accent)' : 'var(--hairline)',
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        className="block transition-transform"
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          background: '#fff',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          marginTop: 2,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
        }}
      />
    </button>
  )
}
