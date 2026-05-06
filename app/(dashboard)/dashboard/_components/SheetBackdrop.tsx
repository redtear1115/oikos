'use client'

interface Props {
  open: boolean
  onClick: () => void
}

export function SheetBackdrop({ open, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className="fixed inset-0 z-[90] transition-opacity duration-[250ms]"
      style={{
        background: 'rgba(31,27,22,0.35)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
      }}
    />
  )
}
