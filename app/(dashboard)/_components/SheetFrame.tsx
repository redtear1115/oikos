'use client'

import { useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useFocusTrap } from './useFocusTrap'

interface SheetFrameProps {
  open: boolean
  onClose: () => void
  /** Accessible label when no titled element exists. Use `labelledBy` instead
   *  when the sheet renders its own visible title. */
  ariaLabel?: string
  /** ID of an element labelling the dialog (overrides `ariaLabel`). */
  labelledBy?: string
  /** Panel background (default `var(--bg)`). */
  background?: string
  /** Drop shadow (default neutral); pass a palette-tinted shadow for
   *  branded sheets like income. */
  boxShadow?: string
  /** Top corner radius in px (default 24). */
  topRadius?: number
  /** Sheet height: 'fixed' locks at `heightDvh` (sheet doesn't reflow on
   *  content changes); 'max' caps at `heightDvh` (sheet grows with content
   *  up to the cap). Default 'max'. */
  heightMode?: 'fixed' | 'max'
  /** dvh value for `height` / `maxHeight` (default 92). */
  heightDvh?: number
  /** Hide the top drag grabber. Rarely needed. */
  hideGrabber?: boolean
  /** Grabber pill background (default neutral); pass `'var(--grabber)'` for
   *  branded sheets. */
  grabberColor?: string
  /** Panel z-index (default 100). */
  zIndex?: number
  /** Skip rendering the default `SheetBackdrop` — for callsites with a
   *  bespoke backdrop (e.g. AssetPickerSheet, ConfirmModal). */
  noBackdrop?: boolean
  /** Optional ref forwarded to the panel for callers that need to attach
   *  their own effects. */
  panelRef?: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}

/**
 * The shared bottom-sheet chrome: backdrop, slide-up panel, grabber, and
 * dialog semantics (`role="dialog"`, `aria-modal`, focus trap). Callers
 * own the header / body / footer inside `children` — this primitive is
 * deliberately unopinionated about content shape so it can host the
 * AddSheet / IncomeSheet / NewFuelLog / RecurringRuleSheet variants
 * without each adding its own escape hatch.
 */
export function SheetFrame({
  open,
  onClose,
  ariaLabel,
  labelledBy,
  background = 'var(--bg)',
  boxShadow = '0 -10px 40px rgba(0,0,0,0.18)',
  topRadius = 24,
  heightMode = 'max',
  heightDvh = 92,
  hideGrabber = false,
  grabberColor = 'rgba(31,27,22,0.18)',
  zIndex = 100,
  noBackdrop = false,
  panelRef,
  children,
}: SheetFrameProps) {
  const fallbackRef = useRef<HTMLDivElement>(null)
  const ref = panelRef ?? fallbackRef
  useFocusTrap(open, ref)

  const fallbackId = useId()
  const labelAttrs = labelledBy
    ? { 'aria-labelledby': labelledBy }
    : { 'aria-label': ariaLabel ?? fallbackId }

  const panelStyle: CSSProperties = {
    background,
    borderTopLeftRadius: topRadius,
    borderTopRightRadius: topRadius,
    boxShadow,
    transform: open ? 'translateY(0)' : 'translateY(100%)',
    transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
    pointerEvents: open ? 'auto' : 'none',
    zIndex,
    ...(heightMode === 'fixed'
      ? { height: `${heightDvh}dvh` }
      : { maxHeight: `${heightDvh}dvh` }),
  }

  return (
    <>
      {!noBackdrop && <SheetBackdrop open={open} onClick={onClose} />}
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        {...labelAttrs}
        className="fixed left-1/2 bottom-0 w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={panelStyle}
      >
        {!hideGrabber && (
          // `relative z-[1]` keeps the grabber visible above any decorative
          // absolutely-positioned content callers render at the top of the
          // panel (e.g. the income RecurringRuleSheet's radial halo).
          <div className="pt-2 flex justify-center shrink-0 relative z-[1]">
            <div
              className="w-9 h-[5px] rounded-full"
              style={{ background: grabberColor }}
              aria-hidden="true"
            />
          </div>
        )}
        {children}
      </div>
    </>
  )
}
