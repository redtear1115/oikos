import { type ReactNode } from 'react'

interface SheetFooterProps {
  children: ReactNode
  /** Stack children vertically instead of the default horizontal flex. */
  stack?: boolean
}

export function SheetFooter({ children, stack = false }: SheetFooterProps) {
  return (
    <div
      className={[
        'shrink-0 flex gap-3',
        stack ? 'flex-col' : 'flex-row items-center',
      ].join(' ')}
      style={{
        paddingLeft: 'var(--sheet-x)',
        paddingRight: 'var(--sheet-x)',
        paddingTop: 'var(--sheet-y-top)',
        paddingBottom: `calc(var(--sheet-y-bottom) + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {children}
    </div>
  )
}
