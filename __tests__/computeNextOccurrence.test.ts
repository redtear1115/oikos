import { describe, it, expect } from 'vitest'
import { computeNextOccurrence, firstAnchorFromStart, snapToFuture } from '@/lib/recurring'

describe('computeNextOccurrence', () => {
  it('advances 1 month at day_of_month', () => {
    expect(computeNextOccurrence('2026-01-15', 1, 15)).toBe('2026-02-15')
  })
  it('clamps day 31 to Feb 28 (non-leap)', () => {
    expect(computeNextOccurrence('2026-01-31', 1, 31)).toBe('2026-02-28')
  })
  it('clamps day 31 to Feb 29 (leap)', () => {
    expect(computeNextOccurrence('2024-01-31', 1, 31)).toBe('2024-02-29')
  })
  it('clamps day 31 to April 30', () => {
    expect(computeNextOccurrence('2026-03-31', 1, 31)).toBe('2026-04-30')
  })
  it('survives Feb→March recovery (Feb 28 + 1mo, day 31 → March 31)', () => {
    expect(computeNextOccurrence('2026-02-28', 1, 31)).toBe('2026-03-31')
  })
  it('handles quarterly interval', () => {
    expect(computeNextOccurrence('2026-01-15', 3, 15)).toBe('2026-04-15')
  })
  it('handles yearly interval with leap clamp', () => {
    expect(computeNextOccurrence('2024-02-29', 12, 29)).toBe('2025-02-28')
  })
})

describe('firstAnchorFromStart', () => {
  it('uses the same month when day_of_month >= startsOn day', () => {
    expect(firstAnchorFromStart('2026-05-07', 25, 1)).toBe('2026-05-25')
  })
  it('rolls to next interval when day_of_month < startsOn day', () => {
    expect(firstAnchorFromStart('2026-05-26', 25, 1)).toBe('2026-06-25')
  })
  it('clamps when day_of_month exceeds the start month length', () => {
    expect(firstAnchorFromStart('2026-02-01', 31, 1)).toBe('2026-02-28')
  })
  it('quarterly start with same month anchor', () => {
    expect(firstAnchorFromStart('2026-05-01', 15, 3)).toBe('2026-05-15')
  })
})

describe('snapToFuture', () => {
  it('returns nextOccurrence unchanged when already in the future', () => {
    expect(snapToFuture('2026-06-01', 1, 1, '2026-05-07')).toBe('2026-06-01')
  })
  it('advances by interval until > today', () => {
    expect(snapToFuture('2026-02-01', 1, 1, '2026-05-07')).toBe('2026-06-01')
  })
  it('snap with day clamp during traversal', () => {
    expect(snapToFuture('2026-01-31', 1, 31, '2026-04-15')).toBe('2026-04-30')
  })
})
