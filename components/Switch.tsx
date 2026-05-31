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
    >
      <span aria-hidden="true" data-switch-thumb className="block" />
    </button>
  )
}
