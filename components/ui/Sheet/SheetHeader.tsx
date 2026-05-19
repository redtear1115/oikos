import { type ReactNode } from 'react'

interface SheetHeaderProps {
  title: string
  /** Rendered left of the title — e.g. an icon, back button, or close action. */
  leading?: ReactNode
  /** Rendered right of the title — e.g. a close button or extra action. */
  trailing?: ReactNode
  /** Set to true when the sheet has no trailing action (title only). */
  hideTrailing?: boolean
  /**
   * Center the title with balanced side slots (3-column grid layout).
   * Default false = title left-aligned, trailing right-aligned.
   */
  centered?: boolean
}

export function SheetHeader({
  title,
  leading,
  trailing,
  hideTrailing = false,
  centered = false,
}: SheetHeaderProps) {
  const paddingStyle = {
    paddingLeft: 'var(--sheet-x)',
    paddingRight: 'var(--sheet-x)',
    paddingTop: 'var(--sheet-y-top)',
    paddingBottom: 'var(--sheet-y-top)',
  }

  if (centered) {
    return (
      <div
        className="shrink-0 grid items-center"
        style={{ ...paddingStyle, gridTemplateColumns: '1fr auto 1fr' }}
      >
        <div className="justify-self-start">{leading ?? <SlotSpacer />}</div>
        <h2 className="text-title font-semibold text-ink truncate min-w-0 px-3">
          {title}
        </h2>
        <div className="justify-self-end">
          {hideTrailing ? <SlotSpacer /> : (trailing ?? <SlotSpacer />)}
        </div>
      </div>
    )
  }

  return (
    <div className="shrink-0 flex items-center justify-between" style={paddingStyle}>
      <div className="flex items-center gap-2 min-w-0">
        {leading && <div className="shrink-0">{leading}</div>}
        <h2 className="text-title font-semibold text-ink truncate min-w-0">{title}</h2>
      </div>
      {!hideTrailing && (
        <div className="shrink-0 ml-3">{trailing ?? <SlotSpacer />}</div>
      )}
    </div>
  )
}

/** Empty slot occupying the same space as a typical icon button — keeps layout balanced. */
function SlotSpacer() {
  return <div className="w-8 h-8" aria-hidden="true" />
}
