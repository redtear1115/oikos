'use client'

import { useEffect, useRef, useState } from 'react'
import { useEscapeToClose } from '@/app/(dashboard)/_components/useEscapeToClose'

interface Props {
  open: boolean
  onClick: () => void
}

// Slide-down transition on consuming sheets is ~320ms; iOS Safari may fire a
// synthetic click up to ~300ms after touchend. Cover both with a single grace
// window so a tap that dismisses the sheet (via Save / outside / etc.) can't
// pass through to a feed item that's now under the previous touch location.
const CLOSE_GRACE_MS = 350

export function SheetBackdrop({ open, onClick }: Props) {
  const [closing, setClosing] = useState(false)
  const wasOpenRef = useRef(open)

  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = open
    if (!wasOpen || open) return
    setClosing(true)
    const t = setTimeout(() => setClosing(false), CLOSE_GRACE_MS)
    return () => clearTimeout(t)
  }, [open])

  // Escape closes the sheet — same effect as a backdrop tap. Stacked sheets
  // unwind one layer per press (see useEscapeToClose).
  useEscapeToClose(open, onClick)

  return (
    <div
      // While closing the backdrop swallows pointer events but must not
      // re-invoke the close handler — the host already called it.
      onClick={open ? onClick : undefined}
      className="fixed inset-0 z-sheet-backdrop transition-opacity duration-[250ms]"
      style={{
        background: 'rgba(31,27,22,0.35)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        opacity: open ? 1 : 0,
        pointerEvents: open || closing ? 'auto' : 'none',
      }}
    />
  )
}
