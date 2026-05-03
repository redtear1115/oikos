/**
 * Share an invite URL via Web Share API, falling back to clipboard.
 * Returns 'shared' on successful native share, 'cancelled' if the user
 * dismissed the share sheet, or 'copied' when we fell back to clipboard.
 */
export async function shareInviteLink(
  url: string,
  title = 'Futari 邀請',
): Promise<'shared' | 'cancelled' | 'copied'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // Fall through to clipboard for non-cancel errors (e.g. permission denied)
    }
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    throw new Error('剪貼簿不可用')
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}
