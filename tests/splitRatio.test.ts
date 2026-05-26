import { describe, it, expect } from 'vitest'
import {
  toViewerShare,
  toMemberAShare,
  loadedSplitRatioToViewerShare,
} from '@/lib/splitRatio'

/**
 * Regression coverage for the `weighted` split UI ↔ DB boundary.
 *
 * The bug this guards against: form / slider state across AddSheet,
 * RecurringRuleSheet, SplitRatioSection, and CompactRow is the **viewer's
 * share %**, but every DB column for the same value is **member A's share
 * %**. For viewer = member A the two angles coincide and the bug stayed
 * hidden in prod for months; for viewer = member B every weighted split
 * gets stored, loaded, balance-computed, and row-displayed at the wrong
 * angle without an explicit flip at the boundary.
 *
 * The tests below cover the boundary from every angle the form touches it:
 *
 *   1. The pure converters (`toViewerShare` / `toMemberAShare`) at all
 *      slider-relevant ratios plus null / undefined edges.
 *   2. The involution property (`f(f(x)) === x`).
 *   3. AddSheet edit-mode load (`loadedSplitRatioToViewerShare`) including
 *      the per-row override / null fallback split.
 *   4. AddSheet save derivation (`deriveCashSplitRatioA = toMemberAShare`).
 *   5. CompactRow per-row "my share" chip (derives meShare via
 *      `toViewerShare`, the formula reads cleanly from there).
 *   6. End-to-end round-trip — set "我 X%" in the form, save, reload,
 *      re-display — for both viewers.
 */

describe('toViewerShare / toMemberAShare — pure conversion', () => {
  const ratios = [0, 1, 50, 75, 90, 99, 100]

  describe('viewer = member A (angles coincide)', () => {
    for (const r of ratios) {
      it(`passes ${r} through unchanged in both directions`, () => {
        expect(toViewerShare(r, true)).toBe(r)
        expect(toMemberAShare(r, true)).toBe(r)
      })
    }
  })

  describe('viewer = member B (angles flip via 100 − r)', () => {
    const expectations: Array<[number, number]> = [
      [0, 100], [1, 99], [50, 50], [75, 25], [90, 10], [99, 1], [100, 0],
    ]
    for (const [r, flipped] of expectations) {
      it(`flips ${r} → ${flipped} in both directions`, () => {
        expect(toViewerShare(r, false)).toBe(flipped)
        expect(toMemberAShare(r, false)).toBe(flipped)
      })
    }
  })

  describe('null / undefined input passes through unchanged', () => {
    it('returns null for null input regardless of viewer', () => {
      expect(toViewerShare(null, true)).toBeNull()
      expect(toViewerShare(null, false)).toBeNull()
      expect(toMemberAShare(null, true)).toBeNull()
      expect(toMemberAShare(null, false)).toBeNull()
    })

    it('returns null for undefined input regardless of viewer', () => {
      expect(toViewerShare(undefined, true)).toBeNull()
      expect(toViewerShare(undefined, false)).toBeNull()
      expect(toMemberAShare(undefined, true)).toBeNull()
      expect(toMemberAShare(undefined, false)).toBeNull()
    })
  })

  describe('involution: f(f(x)) === x', () => {
    for (const r of [1, 25, 50, 75, 99]) {
      it(`round-trips ${r} via toMemberAShare → toViewerShare for viewer B`, () => {
        expect(toViewerShare(toMemberAShare(r, false), false)).toBe(r)
      })
      it(`round-trips ${r} via toViewerShare → toMemberAShare for viewer B`, () => {
        expect(toMemberAShare(toViewerShare(r, false), false)).toBe(r)
      })
      it(`is a no-op round-trip for viewer A at ${r}`, () => {
        expect(toViewerShare(toMemberAShare(r, true), true)).toBe(r)
        expect(toMemberAShare(toViewerShare(r, true), true)).toBe(r)
      })
    }
  })
})

/**
 * Mirrors the AddSheet.tsx:186 edit-mode init:
 *   setSplitRatioA(loadedSplitRatioToViewerShare(initial.splitRatioA, viewerIsA, groupDefaultRatioA ?? 50))
 *
 * The fallback is left raw (not flipped) — the form's create-mode default
 * does the same thing and we keep parity so a user who hasn't touched the
 * record yet sees the same starting point in both modes (see #784 commit
 * message for the rationale).
 */
describe('AddSheet edit-mode load — loadedSplitRatioToViewerShare', () => {
  describe('viewer = member A', () => {
    it('keeps a stored ratio of 75 as 75 in form state', () => {
      expect(loadedSplitRatioToViewerShare(75, true, 50)).toBe(75)
    })
    it('keeps a stored ratio of 90 as 90 (the prod scenario, A side)', () => {
      expect(loadedSplitRatioToViewerShare(90, true, 50)).toBe(90)
    })
    it('falls back to groupDefaultRatioA when the record has no override', () => {
      expect(loadedSplitRatioToViewerShare(null, true, 80)).toBe(80)
    })
    it('falls back to 50 when neither override nor default exists', () => {
      expect(loadedSplitRatioToViewerShare(null, true, 50)).toBe(50)
    })
  })

  describe('viewer = member B (the bug case)', () => {
    it('flips a stored ratio of 75 to 25 in form state', () => {
      expect(loadedSplitRatioToViewerShare(75, false, 50)).toBe(25)
    })
    it('flips a stored ratio of 90 to 10 (the prod scenario, B side)', () => {
      // Replays the screen-2 scenario: A created the record with A=90%,
      // B opens it; slider must land on "我 10%", not "我 90%".
      expect(loadedSplitRatioToViewerShare(90, false, 50)).toBe(10)
    })
    it('returns groupDefaultRatioA raw — fallback is NOT flipped', () => {
      // Matches AddSheet create-mode behaviour: a brand-new record uses
      // the group default at face value; the per-row override is what
      // triggers the viewer-aware flip.
      expect(loadedSplitRatioToViewerShare(null, false, 80)).toBe(80)
    })
    it('falls back to 50 when neither override nor default exists', () => {
      expect(loadedSplitRatioToViewerShare(null, false, 50)).toBe(50)
    })
  })
})

/**
 * Mirrors AddSheet.handleSave / RecurringRuleSheet.handleSave:
 *   splitRatioA: split === 'weighted' ? toMemberAShare(splitRatioA, viewerIsA) : null
 *
 * The conversion is **viewer-aware**, not payer-aware: the slider always
 * means "the viewer's share", and the wire value is just the
 * schema-correct representation of that same intent (A's share). The
 * payer is irrelevant to this conversion — it only enters the calc later
 * inside `transactionDelta`, which already handles paid_by correctly.
 *
 * NOTE on the original spec from the bug report: it suggested
 * payer-based mapping for viewer ≠ payer (e.g. "viewer=A, payer=B, form=75
 * → DB=25"). That produces the wrong balance: A entering "我 75%" with B
 * paying 1350 truthfully owes B 75% × 1350 = 1013 → DB must keep A's
 * share at 75, not flip to 25. We verify the viewer-based math below so
 * the round-trip with `loadedSplitRatioToViewerShare` and the downstream
 * `transactionDelta` balance computation stay correct.
 */
describe('AddSheet save derivation — toMemberAShare', () => {
  describe('viewer = member A — form state already aligns with DB', () => {
    it('form=75 → DB=75 when viewer paid (payer is A)', () => {
      expect(toMemberAShare(75, true)).toBe(75)
    })
    it('form=75 → DB=75 when partner paid (payer is B)', () => {
      // Payer identity does not enter the conversion: the slider's
      // semantic is "my share", which for A == "A's share" regardless
      // of who fronted the cash.
      expect(toMemberAShare(75, true)).toBe(75)
    })
  })

  describe('viewer = member B — form state needs to flip to A-share', () => {
    it('form=75 → DB=25 when viewer paid (payer is B)', () => {
      // "我 75%" intent + B paid 1000:
      //   B's share = 75%; B is owed (100 - 75) × 1000 = 250 from A.
      //   DB stores A=25; transactionDelta(paid_by=B, ratioA=25)
      //     = −ceil(1000 × 25/100) = −250 ✓
      expect(toMemberAShare(75, false)).toBe(25)
    })
    it('form=75 → DB=25 when partner paid (payer is A)', () => {
      // "我 75%" intent + A paid 1000:
      //   B's share = 75%; B owes A 75% × 1000 = 750.
      //   DB stores A=25; transactionDelta(paid_by=A, ratioA=25)
      //     = +ceil(1000 × 75/100) = +750 ✓
      expect(toMemberAShare(75, false)).toBe(25)
    })
  })

  describe('non-weighted splits pass through as null at the call site', () => {
    // The `split === 'weighted' ? ... : null` guard at the call site is
    // outside this function; we document the contract by asserting that
    // the function itself doesn't synthesize a null fallback for a real
    // number — that's the caller's job.
    it('returns a number for a real number input', () => {
      expect(typeof toMemberAShare(50, true)).toBe('number')
      expect(typeof toMemberAShare(50, false)).toBe('number')
    })
  })
})

/**
 * Mirrors CompactRow's per-row "my share" derivation. The DB value is
 * member A's share; the row's `myShare` chip needs the viewer's share, so
 * we flip via toViewerShare before plugging into the existing formula.
 * Asserts both the slider-relevant view AND the resulting dollar amount.
 */
describe('CompactRow display — viewer-aware myShare derivation', () => {
  // Replicates the in-component derivation so the test pins the same math
  // CompactRow actually runs.
  function rowDelta(
    amount: number,
    splitRatioA: number,
    payerIsViewer: boolean,
    viewerIsA: boolean,
  ): { delta: number; myShare: number } {
    const meShare = toViewerShare(splitRatioA, viewerIsA)
    const otherShare = 100 - meShare
    const delta = payerIsViewer
      ? +Math.ceil(amount * otherShare / 100)
      : -Math.ceil(amount * meShare / 100)
    const myShare = payerIsViewer ? amount - delta : -delta
    return { delta, myShare }
  }

  it('viewer A, DB splitRatioA=75 → meShare label reads "我 75%"', () => {
    // toViewerShare is the underlying conversion; the label is just
    // `{ratio}%` interpolation on that value.
    expect(toViewerShare(75, true)).toBe(75)
    expect(100 - toViewerShare(75, true)).toBe(25)
  })

  it('viewer B, DB splitRatioA=75 → meShare label reads "我 25% / 對方 75%"', () => {
    expect(toViewerShare(75, false)).toBe(25)
    expect(100 - toViewerShare(75, false)).toBe(75)
  })

  it('viewer B, A paid 1000, splitRatioA=90 → myShare chip shows $100, not $900', () => {
    // Pre-fix: meShare was read raw as ratioA=90 from B's perspective, so
    // the chip displayed $900 (= 90% × 1000 = A's share) when B's actual
    // share is 10% × 1000 = 100.
    const { delta, myShare } = rowDelta(
      /* amount */ 1000,
      /* splitRatioA */ 90,
      /* payerIsViewer */ false,
      /* viewerIsA */ false,
    )
    expect(delta).toBe(-100)
    expect(myShare).toBe(100)
  })

  it('viewer A, A paid 1000, splitRatioA=90 → myShare chip shows $900 (A keeps the bigger share)', () => {
    const { delta, myShare } = rowDelta(1000, 90, true, true)
    expect(delta).toBe(+100)
    expect(myShare).toBe(900)
  })

  it('viewer B, B paid 1000, A=25 (so B=75) → myShare $750, delta +$250 (A owes B)', () => {
    const { delta, myShare } = rowDelta(1000, 25, true, false)
    expect(delta).toBe(+250)
    expect(myShare).toBe(750)
  })
})

/**
 * End-to-end round-trip: set "我 X%" in the form, save, reload, display.
 * Documents that the boundary helpers compose into a no-op for the user.
 */
describe('end-to-end round-trip: form → DB → reload → display', () => {
  it('viewer B sets "我 90%", paid 1350 → DB=10 → reload form=90 → row "my share" $1215', () => {
    const viewerIsA = false
    const formIntent = 90

    // Save
    const dbRatio = toMemberAShare(formIntent, viewerIsA)
    expect(dbRatio).toBe(10)

    // Reload
    const reloaded = loadedSplitRatioToViewerShare(dbRatio, viewerIsA, 50)
    expect(reloaded).toBe(formIntent)

    // Per-row "my share" chip (B paid → payerIsViewer = true)
    const meShare = toViewerShare(dbRatio, viewerIsA)
    expect(meShare).toBe(90)
    const otherShare = 100 - meShare
    const delta = +Math.ceil(1350 * otherShare / 100)
    expect(delta).toBe(+135) // A owes B their 10% share = 135
    const myShare = 1350 - delta
    expect(myShare).toBe(1215) // B's 90% share, correctly attributed
  })

  it('viewer A sets "我 90%", paid 1350 → DB=90 → reload form=90 → row "my share" $1215', () => {
    const viewerIsA = true
    const formIntent = 90

    const dbRatio = toMemberAShare(formIntent, viewerIsA)
    expect(dbRatio).toBe(90)

    const reloaded = loadedSplitRatioToViewerShare(dbRatio, viewerIsA, 50)
    expect(reloaded).toBe(formIntent)

    const meShare = toViewerShare(dbRatio, viewerIsA)
    expect(meShare).toBe(90)
    const otherShare = 100 - meShare
    const delta = +Math.ceil(1350 * otherShare / 100)
    expect(delta).toBe(+135)
    const myShare = 1350 - delta
    expect(myShare).toBe(1215)
  })

  it('cross-viewer round-trip: A creates with "我 75%" / paid 1000 → B opens → sees "我 25%" / "對方 75%"', () => {
    // A's intent: A=75%, B=25%, A paid 1000. So B owes A 250.
    const dbRatio = toMemberAShare(75, /* A as viewer */ true)
    expect(dbRatio).toBe(75)

    // Later B opens the same record.
    const bFormState = loadedSplitRatioToViewerShare(dbRatio, /* B as viewer */ false, 50)
    expect(bFormState).toBe(25) // B's actual share is 25%

    // B's per-row chip — partner (A) paid, viewer (B) didn't:
    const meShare = toViewerShare(dbRatio, false)
    expect(meShare).toBe(25)
    const delta = -Math.ceil(1000 * meShare / 100)
    expect(delta).toBe(-250) // B owes A 250
    const myShare = -delta
    expect(myShare).toBe(250)
  })
})
