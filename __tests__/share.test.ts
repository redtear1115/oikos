import { describe, it, expect, vi, afterEach } from 'vitest'
import { shareInviteLink } from '@/lib/share'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shareInviteLink', () => {
  it('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    expect(share).toHaveBeenCalledWith({ title: 'Futari 邀請', url: 'https://example.com/invite/abc' })
    expect(writeText).not.toHaveBeenCalled()
    expect(result).toBe('shared')
  })

  it('returns "cancelled" when user aborts share', async () => {
    const abort = new Error('user cancelled')
    abort.name = 'AbortError'
    const share = vi.fn().mockRejectedValue(abort)
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    expect(result).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when navigator.share missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    expect(writeText).toHaveBeenCalledWith('https://example.com/invite/abc')
    expect(result).toBe('copied')
  })
})
