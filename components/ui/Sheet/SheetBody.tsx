import { type ReactNode } from 'react'

interface SheetBodyProps {
  children: ReactNode
  /** Remove default horizontal padding (e.g. when content is full-bleed). */
  noPadding?: boolean
}

export function SheetBody({ children, noPadding = false }: SheetBodyProps) {
  return (
    <div
      className="flex-1 overflow-y-auto"
      style={noPadding ? undefined : {
        paddingLeft: 'var(--sheet-x)',
        paddingRight: 'var(--sheet-x)',
      }}
    >
      {children}
    </div>
  )
}
