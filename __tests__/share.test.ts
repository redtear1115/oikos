import { describe, it, expect, vi, afterEach } from 'vitest'
import { shareInviteLink } from '@/lib/share'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shareInviteLink', () => {
  it('copies first then opens native share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    // Both happen — clipboard first as a desktop safety net, share on top.
    expect(writeText).toHaveBeenCalledWith('https://example.com/invite/abc')
    expect(share).toHaveBeenCalledWith({ title: 'Futari 邀請', url: 'https://example.com/invite/abc' })
    expect(result).toBe('shared')
  })

  it('returns "copied" when user aborts the native share sheet', async () => {
    const abort = new Error('user cancelled')
    abort.name = 'AbortError'
    const share = vi.fn().mockRejectedValue(abort)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    // Clipboard succeeded before the cancelled share, so caller can still toast.
    expect(writeText).toHaveBeenCalledWith('https://example.com/invite/abc')
    expect(result).toBe('copied')
  })

  it('returns "copied" when navigator.share is missing entirely', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    expect(writeText).toHaveBeenCalledWith('https://example.com/invite/abc')
    expect(result).toBe('copied')
  })

  it('returns "copied" when navigator.share throws a non-AbortError', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })

    const result = await shareInviteLink('https://example.com/invite/abc')
    expect(share).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('https://example.com/invite/abc')
    expect(result).toBe('copied')
  })

  it('throws when neither clipboard nor share is available', async () => {
    vi.stubGlobal('navigator', {})
    await expect(shareInviteLink('https://example.com/invite/abc')).rejects.toThrow('連結無法傳送')
  })

  it('still returns "shared" if clipboard is unavailable but share works', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })  // no clipboard

    const result = await shareInviteLink('https://example.com/invite/abc')
    expect(share).toHaveBeenCalledOnce()
    expect(result).toBe('shared')
  })
})
