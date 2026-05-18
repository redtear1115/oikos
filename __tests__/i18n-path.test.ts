import { describe, it, expect } from 'vitest'
import { isPublicLocalizedPath } from '@/lib/i18n/path'

describe('isPublicLocalizedPath', () => {
  it('matches root + landing/sign-in/terms/privacy across locales', () => {
    expect(isPublicLocalizedPath('/')).toBe(true)
    expect(isPublicLocalizedPath('/sign-in')).toBe(true)
    expect(isPublicLocalizedPath('/en/sign-in')).toBe(true)
    expect(isPublicLocalizedPath('/ja')).toBe(true)
    expect(isPublicLocalizedPath('/ja/privacy')).toBe(true)
  })

  it('matches /migrate subtree (any source)', () => {
    expect(isPublicLocalizedPath('/migrate/honeydue')).toBe(true)
    expect(isPublicLocalizedPath('/migrate/spendee')).toBe(true)
    expect(isPublicLocalizedPath('/migrate/cwmoney')).toBe(true)
    expect(isPublicLocalizedPath('/en/migrate/honeydue')).toBe(true)
    expect(isPublicLocalizedPath('/migrate')).toBe(true)
  })

  it('does not match /migrateXxx pseudo-prefix collisions', () => {
    expect(isPublicLocalizedPath('/migratesomething')).toBe(false)
  })

  it('does not match auth-walled paths', () => {
    expect(isPublicLocalizedPath('/dashboard')).toBe(false)
    expect(isPublicLocalizedPath('/settings')).toBe(false)
    expect(isPublicLocalizedPath('/records')).toBe(false)
  })
})
