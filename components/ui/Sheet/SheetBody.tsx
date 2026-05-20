import { type ReactNode, type Ref } from 'react'

interface SheetBodyProps {
  children: ReactNode
  /** Remove default horizontal padding (e.g. when content is full-bleed). */
  noPadding?: boolean
  /** Ref to the scrollable container — needed for `useScrollToTopOnOpen`
   *  on long sheets that stay mounted across opens (e.g. AddSheet). */
  ref?: Ref<HTMLDivElement>
}

export function SheetBody({ children, noPadding = false, ref }: SheetBodyProps) {
  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto [overscroll-behavior:contain]"
      style={noPadding ? undefined : {
        paddingLeft: 'var(--sheet-x)',
        paddingRight: 'var(--sheet-x)',
      }}
    >
      {children}
    </div>
  )
}
