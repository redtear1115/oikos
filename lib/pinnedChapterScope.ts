import type { EpochWindow } from '@/lib/db/queries/epoch'

/**
 * Cut-off for entity reads (assets and their recurring rules) when the viewer
 * is looking at a closed chapter of a group they are no longer part of.
 *
 * `resolveViewerEpochContext` follows the past-chapter pin to the chapter's
 * group even after the viewer has left or been removed from it. Money reads
 * are already bounded by the chapter window, but asset rows are not
 * chapter-scoped: without a cut-off, the pinned viewer would see assets and
 * rules the remaining members created after the chapter closed.
 *
 * Returns the chapter's `endedAt` when the viewer is on such a pin, so the
 * caller only reads rows with `created_at < endedAt`. Returns `null` —
 * no filtering, behaviour unchanged — for:
 *   - the current (open) chapter;
 *   - any viewer who is still one of the group's current members, including
 *     a current member looking at one of the group's closed chapters.
 *
 * Known limit (by design): an asset or rule created before the cut-off is
 * still shown with its CURRENT field values; edits made after the chapter
 * closed are not rolled back, because these rows are updated in place and
 * keep no history. Only rows created after the cut-off are withheld.
 */
export function nonMemberPinCutoff(
  context: {
    group: { memberA: string; memberB: string | null }
    window: EpochWindow
  },
  viewerId: string,
): Date | null {
  const { group, window } = context
  if (!window.isPast || window.endedAt === null) return null
  if (group.memberA === viewerId || group.memberB === viewerId) return null
  return window.endedAt
}
