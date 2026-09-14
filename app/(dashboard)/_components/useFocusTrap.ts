'use client'

import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null,
  )
}

interface TrapEntry {
  /** Where focus goes back to when this trap is released. Mutable: see the
   *  hand-off in the cleanup below. */
  restoreTo: HTMLElement | null
  /** The trigger's `id` at activation, `''` when it had none. A node
   *  reference alone is not a durable identity: the trigger can be unmounted
   *  and re-mounted as a *different* element while the trap is open — every
   *  dashboard surface renders the FAB as `{!hideFab && <button…>}` with
   *  `hideFab` tied to the sheet's own open state, so opening the sheet
   *  destroys the button that opened it (#1256). Mutable alongside
   *  `restoreTo`; the two are always handed off together. */
  restoreToId: string
  /** The panel element captured at activation. Refs are already detached by
   *  the time a passive-effect cleanup runs on unmount, so the cleanup can't
   *  read `panelRef.current` to ask "was this node inside me". */
  panel: HTMLElement | null
}

/**
 * Module-level stack of active traps, mirroring the one in useEscapeToClose.
 * Every trap listens on `window`, so without it two open traps (a SheetFrame
 * plus the ConfirmModal it spawned) each run their own "focus left my panel →
 * pull it back" logic on the same Tab press and cancel each other out: Tab is
 * swallowed and the modal's confirm button is pointer-only (#1171 F1, #1176).
 * Only the most recently activated trap handles Tab.
 */
const stack: TrapEntry[] = []

/**
 * Last element that genuinely held focus, kept alive past its own removal.
 *
 * A trap records its restore target from `document.activeElement` in a layout
 * effect, which runs *after* React's mutation phase. When the trigger is
 * unmounted by the very state change that opens the sheet — `{!hideFab &&
 * <button…>}` with `hideFab={sheetOpen}`, the shape of every dashboard
 * surface — the browser has already moved focus to `<body>` by then, so the
 * trap records `<body>` and restores to `<body>` (#1256). This listener is
 * the only place that still remembers which element it was.
 *
 * Capture phase, `focusin` (not `focus`) so it sees every control, and the
 * listener outlives individual traps: it is installed by the first trap
 * mounted on the page and never removed. SheetFrame panels stay mounted while
 * closed, so it is listening long before anything opens.
 */
let lastFocused: HTMLElement | null = null
let tracking = false
function trackLastFocused(): void {
  if (tracking || typeof document === 'undefined') return
  tracking = true
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target
      if (el instanceof HTMLElement && el !== document.body) lastFocused = el
    },
    true,
  )
}

/**
 * The element focus was on immediately before this commit removed it, or null.
 *
 * Deliberately narrow: only a *detached* `lastFocused` counts. Focus sitting
 * on `<body>` while the last-focused element is still in the document means
 * the user left it there on purpose — on iOS a touch on a button doesn't set
 * focus at all — and reviving a stale trigger then would move focus somewhere
 * the user never was.
 */
function removedTrigger(): HTMLElement | null {
  return lastFocused && !lastFocused.isConnected ? lastFocused : null
}

/**
 * Resolve the recorded trigger to a node that can actually take focus now.
 *
 * Two ways the recorded node stops being usable:
 *
 * 1. It is gone for good — deleting a record from its sheet removes the very
 *    row that opened it. Nothing to resolve; the caller falls back.
 * 2. It was *replaced* while the trap was open. The FAB is conditionally
 *    rendered on the sheet's own open state, so closing the sheet mounts a
 *    fresh button and the recorded one is detached (#1256). An `id` survives
 *    that round trip where a node reference cannot, so re-query by it.
 *
 * Only an explicit, author-assigned `id` participates: unlabelled triggers
 * resolve to null and keep the #1242 behaviour exactly. `getElementById`
 * already implies "in the document", but a re-found node can still be parked
 * inside a closed (`inert`) sheet — focusing that is a no-op in a real engine
 * and would read as "focus vanished", so treat it as unresolved too.
 */
function resolveRestoreTarget(target: HTMLElement | null, id: string): HTMLElement | null {
  if (target?.isConnected) return target
  if (!id) return null
  const again = document.getElementById(id)
  if (!again || again.closest('[inert]')) return null
  return again
}

/**
 * Put focus back after the topmost trap closes (#1242).
 *
 * `preventScroll`: the trigger is often a list row far down a scrolled page.
 * A plain focus() scrolls it into view, so closing a sheet opened from that
 * row jumps the page. Supported from iOS/Safari 15 (our Capacitor floor is
 * iOS 15.0); older engines ignore the options object and still focus, they
 * just keep the old scrolling behaviour.
 *
 * Unresolvable trigger (see resolveRestoreTarget): focus() on a detached node
 * silently does nothing and focus is left on <body>, so the next Tab restarts
 * from the top of the document. Fall back to the trap that is now on top (a
 * sheet under a closing modal): its panel if the panel is itself focusable,
 * else its first control.
 *
 * With no trap left underneath there is no fallback on purpose: the dashboard
 * has no focusable <main> landmark, and guessing at "the next row" could land
 * on something unrelated. Focus stays where the browser leaves it (<body>).
 * Symptom of that case, so it isn't mistaken for a regression: after deleting
 * a record from its sheet, the next Tab starts from the page header.
 */
function restoreFocus(entry: TrapEntry, below: TrapEntry | undefined): void {
  const target = resolveRestoreTarget(entry.restoreTo, entry.restoreToId)
  if (target) {
    target.focus({ preventScroll: true })
    return
  }
  const panel = below?.panel
  if (!panel?.isConnected) return
  const into = panel.hasAttribute('tabindex') ? panel : focusables(panel)[0]
  into?.focus({ preventScroll: true })
}

/**
 * Trap Tab / Shift+Tab inside `panelRef` while `open` is true, and restore
 * focus to the previously-focused element when the trap is released.
 *
 * Pairs with useFocusAndSelectOnOpen (which moves focus *into* the sheet on
 * mount) and useEscapeToClose (which handles dismissal). The trap is passive
 * — it only intercepts Tab when focus would leave the panel.
 *
 * Nested traps: only the topmost one responds. Traps are ordered by
 * activation, not by DOM position — so a modal can be portalled anywhere and
 * still sit above the sheet that opened it.
 */
export function useFocusTrap(open: boolean, panelRef: RefObject<HTMLElement | null>): void {
  // The restore target is read in a layout effect, the rest of the trap runs
  // in a passive one. useFocusAndSelectOnOpen moves focus into the sheet from
  // a layout effect, and every layout effect in a commit runs before every
  // passive one — so a passive read recorded the sheet's own amount input as
  // the restore target. Layout effects run child-first, which lets SheetFrame
  // (rendered *by* the sheet that calls useFocusAndSelectOnOpen) read before
  // its parent moves focus.
  //
  // The restore itself must stay in the passive cleanup: a focus() call made
  // during React's mutation phase (where layout cleanups run on update) is
  // undone by React's own focus/selection restore at the end of the commit.
  //
  // Symptom if either half regresses: nothing errors and the sheet opens and
  // closes normally, but after Escape / save / delete focus lands on <body>
  // instead of the button that opened the sheet. Same symptom if a
  // focus-on-open ever moves *below* SheetFrame (into its `children`), since
  // that child layout effect would then run first.
  // Install once per page, from the first trap that mounts — not from the
  // `open` effect below, which would start listening only after the trigger
  // that opened the sheet is already gone.
  useEffect(trackLastFocused, [])

  const restoreToRef = useRef<HTMLElement | null>(null)
  const restoreToIdRef = useRef('')
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement as HTMLElement | null
    // `<body>` means either "the trigger was just unmounted" (recover it from
    // the focus tracker) or "focus was genuinely nowhere" (keep recording
    // `<body>`, which restores to nothing, exactly as before #1256).
    const trigger = active && active !== document.body ? active : (removedTrigger() ?? active)
    restoreToRef.current = trigger
    restoreToIdRef.current = trigger?.id ?? ''
  }, [open])

  useEffect(() => {
    if (!open) return
    const entry: TrapEntry = {
      restoreTo: restoreToRef.current,
      restoreToId: restoreToIdRef.current,
      panel: panelRef.current,
    }
    stack.push(entry)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      if (stack[stack.length - 1] !== entry) return
      const panel = panelRef.current
      if (!panel) return
      const items = focusables(panel)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      const insidePanel = active && panel.contains(active)

      if (!insidePanel) {
        e.preventDefault()
        first.focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const i = stack.indexOf(entry)
      if (i < 0) return
      const wasTop = i === stack.length - 1
      stack.splice(i, 1)

      if (!wasTop) {
        // A lower layer closed while something above it is still open — e.g.
        // a sheet's delete-confirm fires onDelete, which closes the sheet in
        // the same commit as the modal. Don't move focus now (the upper trap
        // still owns it). But if the upper layer's restore target lives inside
        // this panel, that target is about to be hidden, so hand it ours
        // instead; otherwise focus would be restored into a closed sheet.
        const above = stack[i]
        if (above?.restoreTo && entry.panel?.contains(above.restoreTo)) {
          above.restoreTo = entry.restoreTo
          above.restoreToId = entry.restoreToId
        }
        return
      }

      restoreFocus(entry, stack[stack.length - 1])
    }
  // panelRef is stable; intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}
