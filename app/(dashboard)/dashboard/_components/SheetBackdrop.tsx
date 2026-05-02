'use client'

interface Props {
  open: boolean
  onClick: () => void
}

export function SheetBackdrop({ open, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-[70] transition-opacity duration-[250ms]"
      style={{
        background: 'rgba(31,27,22,0.35)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
      }}
    />
  )
}
