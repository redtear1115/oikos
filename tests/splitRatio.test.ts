import { describe, it, expect } from 'vitest'
import { loadedSplitRatioToViewerShare } from '@/lib/splitRatio'

// Regression for AddSheet.tsx:186 — edit-mode initialization of the
// weighted-split slider for `viewer = member B`. The DB column is member A's
// share %; the form state is the viewer's share %. Before the fix the value
// was assigned raw, so B opened an existing weighted record with the
// partner's percentage labelled as their own.
describe('loadedSplitRatioToViewerShare', () => {
  it('passes the value through when viewer is member A (angles coincide)', () => {
    expect(loadedSplitRatioToViewerShare(90, true, 50)).toBe(90)
    expect(loadedSplitRatioToViewerShare(25, true, 50)).toBe(25)
  })

  it('flips the value when viewer is member B (edit existing weighted record)', () => {
    // Record stored as A=90% → from B's viewpoint, B is at 10%
    expect(loadedSplitRatioToViewerShare(90, false, 50)).toBe(10)
    expect(loadedSplitRatioToViewerShare(25, false, 50)).toBe(75)
  })

  it('returns the fallback unchanged when the record carries no override', () => {
    // null / undefined dbRatioA → fallback (typically groupDefaultRatioA ??
    // 50) is passed through as-is regardless of viewer.
    expect(loadedSplitRatioToViewerShare(null, false, 60)).toBe(60)
    expect(loadedSplitRatioToViewerShare(undefined, true, 60)).toBe(60)
    expect(loadedSplitRatioToViewerShare(null, true, 50)).toBe(50)
  })

  it('round-trips for edge values 1 and 99', () => {
    expect(loadedSplitRatioToViewerShare(1, false, 50)).toBe(99)
    expect(loadedSplitRatioToViewerShare(99, false, 50)).toBe(1)
  })

  it('replays the prod symptom: B opens record A created with A=90% — slider lands on 10%, not 90%', () => {
    // Before the fix, B opened the record with splitRatioA = 90 in state,
    // so the slider read "我 90% / 對方 10%" — partner's percentage labelled
    // as the viewer's, and SplitTypeSelector's preview ran the wrong way.
    const fromForm = loadedSplitRatioToViewerShare(90, /* viewerIsA */ false, 50)
    expect(fromForm).toBe(10)
  })
})
