export function ToggleButton({
  onClick,
  ariaLabel,
  expanded,
  children,
}: {
  onClick: () => void
  ariaLabel: string
  expanded: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      className="h-7 w-7 grid place-items-center rounded-full cursor-pointer bg-transparent"
      style={{
        color: 'var(--ink-2)',
        border: '1px solid var(--hairline)',
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  )
}
