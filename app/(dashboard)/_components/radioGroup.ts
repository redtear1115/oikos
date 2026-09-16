import type { KeyboardEvent } from 'react'

/**
 * Keyboard model for hand-rolled `role="radiogroup"` controls (#1242), per the
 * WAI-ARIA radio group pattern: the group is one Tab stop (roving tabindex),
 * and ←/↑ / →/↓ move to the previous / next radio *and* select it, wrapping at
 * the ends. Home / End jump to the first / last radio (#1252).
 *
 * Plain functions rather than a hook: there is no state to hold — the checked
 * radio already lives in each caller's React state, and the DOM order of the
 * radios is the navigation order.
 *
 * Symptom if a group is left without these: nothing looks wrong with a mouse
 * or touch, but a keyboard user Tabs through every option one by one, and the
 * arrow keys (which a screen reader announces as the way to move in a radio
 * group) do nothing.
 */

/** Radios that can take focus. `aria-disabled` normally counts as disabled, so
 *  arrows don't walk onto an option the group is ignoring.
 *
 *  The exception is `aria-busy="true"` on the group. Select-and-save groups
 *  (SplitTypeSection, CurrencySettings) mark *every* radio `aria-disabled`
 *  while the save runs so the radio the arrow key just moved to keeps focus.
 *  With the plain rule that emptied the list and the arrow keys went
 *  completely dead for the length of the round trip — and silently: nothing
 *  moves, nothing is announced, and on a fast connection it is over before
 *  the user can tell it apart from a key that didn't register. `aria-busy`
 *  distinguishes "unavailable" from "in flight": focus keeps moving, and the
 *  selection doesn't change because each caller's handler early-returns while
 *  saving. */
function navigableRadios(group: HTMLElement): HTMLElement[] {
  const busy = group.getAttribute('aria-busy') === 'true'
  return Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
    (el) =>
      el.closest('[role="radiogroup"]') === group &&
      !(el as HTMLButtonElement).disabled &&
      (busy || el.getAttribute('aria-disabled') !== 'true'),
  )
}

/** Attach to the `role="radiogroup"` element's `onKeyDown`. Keys pressed on
 *  anything that isn't one of its radios (e.g. the weighted-split slider that
 *  SplitTypeSelector nests inside its group) are left alone. */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  // Home / End are optional in the WAI-ARIA radio group pattern, but a
  // keyboard user who has them elsewhere (listbox, menu, grid) will try them
  // here too; without this they scroll the sheet or the page behind it.
  let move: 1 | -1 | 'first' | 'last'
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      move = 1
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      move = -1
      break
    case 'Home':
      move = 'first'
      break
    case 'End':
      move = 'last'
      break
    default:
      return
  }
  const target = e.target as HTMLElement
  if (target.getAttribute('role') !== 'radio') return
  const radios = navigableRadios(e.currentTarget)
  const i = radios.indexOf(target)
  if (i < 0) return
  e.preventDefault()
  const next =
    move === 'first'
      ? radios[0]
      : move === 'last'
        ? radios[radios.length - 1]
        : radios[(i + move + radios.length) % radios.length]
  next.focus()
  // Selection follows focus. `click()` reuses each radio's own onClick, so
  // callers don't need a second "select by index" path.
  next.click()
}

/** tabIndex for a radio under roving tabindex: the checked radio is the
 *  group's Tab stop; with nothing checked, the first radio is. */
export function rovingTabIndex(checked: boolean, isFirst: boolean, anyChecked: boolean): 0 | -1 {
  if (checked) return 0
  return !anyChecked && isFirst ? 0 : -1
}
