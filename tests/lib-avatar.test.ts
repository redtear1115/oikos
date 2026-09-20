import { describe, it, expect } from 'vitest'
import { maskAvatarUrl } from '@/lib/avatar'

describe('maskAvatarUrl (#1328)', () => {
  it('returns null when avatarHidden is true, even if avatarUrl is set', () => {
    const profile = { avatarUrl: 'https://example.com/photo.jpg', avatarHidden: true }
    expect(maskAvatarUrl(profile)).toBeNull()
  })

  it('passes avatarUrl through when avatarHidden is false', () => {
    const profile = { avatarUrl: 'https://example.com/photo.jpg', avatarHidden: false }
    expect(maskAvatarUrl(profile)).toBe('https://example.com/photo.jpg')
  })

  it('returns null when avatarUrl was already null, regardless of the flag', () => {
    expect(maskAvatarUrl({ avatarUrl: null, avatarHidden: false })).toBeNull()
    expect(maskAvatarUrl({ avatarUrl: null, avatarHidden: true })).toBeNull()
  })
})
