import type { KeyboardEvent } from 'react'

/**
 * Keyboard model for hand-rolled `role="radiogroup"` controls (#1242), per the
 * WAI-ARIA radio group pattern: the group is one Tab stop (roving tabindex),
 * and ←/↑ / →/↓ move to the previous / next radio *and* select it, wrapping at
 * the ends.
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

/** Radios that can take focus. `aria-disabled` counts as disabled so a group
 *  that stays focusable during a save (to keep focus from dropping) doesn't
 *  let arrows move past a selection it is ignoring. */
function navigableRadios(group: HTMLElement): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
    (el) =>
      el.closest('[role="radiogroup"]') === group &&
      !(el as HTMLButtonElement).disabled &&
      el.getAttribute('aria-disabled') !== 'true',
  )
}

/** Attach to the `role="radiogroup"` element's `onKeyDown`. Keys pressed on
 *  anything that isn't one of its radios (e.g. the weighted-split slider that
 *  SplitTypeSelector nests inside its group) are left alone. */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  let delta: 1 | -1
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      delta = 1
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      delta = -1
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
  const next = radios[(i + delta + radios.length) % radios.length]
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
