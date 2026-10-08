import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1131 — the solo month hero must not render while pinned to a past chapter.
 *
 * `monthlyStatsByCategory` ANDs "this calendar month" (`_predicates.ts`) with
 * the pinned epoch's rows (`epochClause`), so for any chapter that closed
 * before the current month the intersection is empty and the hero renders
 * "{current month} · NT$ 0 · 0 筆" — a heading with an opinion about a month
 * that is not in this chapter.
 *
 * ## Why this is a source-level guard and not a render test
 *
 * `Dashboard` takes ~18 props including a `feedDataPromise`, and the repo has
 * no render harness for it — `SoloMonthHero.test.tsx` covers the hero in
 * isolation, which cannot see the slot's condition. Reproducing the real state
 * needs a solo account pinned to a closed epoch, and there is no dev-server
 * shortcut to it. So this asserts the one thing that is checkable without that
 * data: the slot is gated on `isPast`.
 *
 * It is deliberately structural rather than textual — it locates the
 * solo-expense branch and asserts the gate lives inside it, so reformatting the
 * JSX does not break it, and moving the gate somewhere it no longer guards this
 * hero does.
 *
 * **This does not prove what a user sees.** See the PR for what was and was not
 * verified.
 */

const source = readFileSync(
  join(process.cwd(), 'app/(dashboard)/dashboard/_components/Dashboard.tsx'),
  'utf8',
)
// Comments name `isPast` while explaining the gate; assertions are about code.
const code = source.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '')

// #1604 hoisted the gate: the whole hero slot is `isPast ? null : …`, so a
// pinned chapter gets neither the solo month hero nor BalanceHero (which shows
// the live getGroupBalance). The solo-expense branch now sits behind it.
const BRANCH_START = "{isPast ? null : isSolo && mode === 'expense' ? ("
const HERO = '<SoloMonthHero'
const BALANCE = '<BalanceHero'

describe('hero slot while pinned (#1131, #1604)', () => {
  it('still has the gated solo-expense branch this guard is about', () => {
    // If this fails the slot was restructured and the guard below is measuring
    // nothing — fix the guard rather than deleting it.
    expect(code).toContain(BRANCH_START)
    expect(code).toContain(HERO)
    expect(code).toContain(BALANCE)
  })

  it('gates both heroes on isPast before either is reached', () => {
    const from = code.indexOf(BRANCH_START)
    expect(from).toBeGreaterThan(-1)
    expect(code.indexOf(HERO)).toBeGreaterThan(from)
    expect(code.indexOf(BALANCE)).toBeGreaterThan(from)
  })

  it('reads isPast from the member context', () => {
    expect(code).toMatch(/const \{[^}]*isPast[^}]*\} = useMember\(\)/)
  })

  it('does not fall back to BalanceHero for a past solo chapter', () => {
    // getGroupBalance() takes no epoch argument, so a fallback would show the
    // *current* balance inside a frozen chapter — wrong beats empty here.
    const from = code.indexOf(BRANCH_START)
    const to = code.indexOf(HERO, from)
    expect(code.slice(from, to)).not.toContain('BalanceHero')
  })
})
