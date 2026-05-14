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
      className="oik-switch relative inline-flex shrink-0 cursor-pointer disabled:cursor-default"
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        background: checked ? 'var(--switch-on-bg)' : 'var(--switch-off-bg)',
        border: 'none',
        padding: 0,
        transition: `background var(--toggle-transition)`,
        opacity: disabled ? 'var(--toggle-disabled-opacity)' : 1,
      }}
    >
      <span
        aria-hidden="true"
        className="block"
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          background: 'var(--switch-thumb-bg)',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          marginTop: 2,
          boxShadow: 'var(--switch-thumb-shadow)',
          transition: `transform var(--toggle-transition)`,
        }}
      />
    </button>
  )
}
