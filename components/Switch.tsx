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
      data-state={checked ? 'on' : 'off'}
      data-disabled={disabled ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
      className="oik-switch relative inline-flex shrink-0 cursor-pointer disabled:cursor-default"
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        border: 'none',
        padding: 0,
      }}
    >
      <span
        aria-hidden="true"
        data-switch-thumb
        className="block"
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          marginTop: 2,
        }}
      />
    </button>
  )
}
