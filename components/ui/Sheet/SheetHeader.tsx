import { type ReactNode } from 'react'

interface SheetHeaderProps {
  title: string
  /** Rendered right of the title — e.g. a close button or extra action. */
  trailing?: ReactNode
  /** Set to true when the sheet has no trailing action (title only). */
  hideTrailing?: boolean
}

export function SheetHeader({ title, trailing, hideTrailing = false }: SheetHeaderProps) {
  return (
    <div
      className="shrink-0 flex items-center justify-between"
      style={{
        paddingLeft: 'var(--sheet-x)',
        paddingRight: 'var(--sheet-x)',
        paddingTop: 'var(--sheet-y-top)',
        paddingBottom: 'var(--sheet-y-top)',
      }}
    >
      <h2 className="text-title font-semibold text-ink truncate min-w-0">{title}</h2>
      {!hideTrailing && (
        <div className="shrink-0 ml-3">
          {trailing ?? <DefaultCloseSlot />}
        </div>
      )}
    </div>
  )
}

/** Empty slot occupying the same space as a close button — keeps title left-aligned. */
function DefaultCloseSlot() {
  return <div className="w-8 h-8" aria-hidden="true" />
}
