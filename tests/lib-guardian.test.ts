import { describe, it, expect } from 'vitest'
import { canAccessGuardian } from '@/lib/guardian'

describe('canAccessGuardian (#220 helper)', () => {
  it('returns true when beta flag is enabled', () => {
    expect(canAccessGuardian({ guardianBetaEnabled: true })).toBe(true)
  })

  it('returns false when beta flag is disabled', () => {
    expect(canAccessGuardian({ guardianBetaEnabled: false })).toBe(false)
  })
})
