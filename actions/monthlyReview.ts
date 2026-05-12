'use server'

import { db } from '@/lib/db/client'
import { monthlyReviewMessages, monthlyReviewSnapshots } from '@/lib/db/schema'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { validateMessageBody, formatYearMonth } from '@/lib/monthlyReview'
import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export interface UpsertMonthlyReviewMessageInput {
  /** Message is *given to* this month (future-facing — see schema comment). */
  year: number
  month: number
  body: string
}

/**
 * Upsert the viewer's own message for (year, month). Refuses when locked_at
 * is set on the existing row (post month-end cron); the UI defends with a
 * read-only state but the server is the authority.
 */
export async function upsertMonthlyReviewMessage(
  input: UpsertMonthlyReviewMessageInput,
): Promise<{ id: string }> {
  const body = validateMessageBody(input.body)
  const { user, group } = await requireViewerGroup()

  const [existing] = await db
    .select({
      id: monthlyReviewMessages.id,
      lockedAt: monthlyReviewMessages.lockedAt,
    })
    .from(monthlyReviewMessages)
    .where(and(
      eq(monthlyReviewMessages.groupId, group.id),
      eq(monthlyReviewMessages.memberId, user.id),
      eq(monthlyReviewMessages.year, input.year),
      eq(monthlyReviewMessages.month, input.month),
    ))
    .limit(1)

  if (existing?.lockedAt) {
    throw new Error('這個月的留言已鎖定，無法再修改')
  }

  let id: string
  if (existing) {
    const [updated] = await db
      .update(monthlyReviewMessages)
      .set({ body, updatedAt: new Date() })
      .where(and(
        eq(monthlyReviewMessages.id, existing.id),
        // Defence-in-depth: if the cron stamps locked_at between our SELECT
        // and UPDATE, the WHERE filter prevents the write.
        isNull(monthlyReviewMessages.lockedAt),
      ))
      .returning({ id: monthlyReviewMessages.id })
    if (!updated) throw new Error('留言已鎖定，無法再修改')
    id = updated.id
  } else {
    const [created] = await db
      .insert(monthlyReviewMessages)
      .values({
        groupId: group.id,
        memberId: user.id,
        year: input.year,
        month: input.month,
        body,
      })
      .returning({ id: monthlyReviewMessages.id })
    id = created.id
  }

  // Both /review pages (the one being edited and the one whose banner cites
  // this message) derive from this row.
  const monthSlug = formatYearMonth({ year: input.year, month: input.month })
  const reviewSlug = formatYearMonth(prevMonthFor(input.year, input.month))
  revalidatePath(`/review/${monthSlug}`)
  revalidatePath(`/review/${reviewSlug}`)
  revalidatePath('/dashboard')
  return { id }
}

function prevMonthFor(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

export interface DismissMonthlyReviewBannerInput {
  /** The reviewed month (snapshot.year/snapshot.month — past month). */
  year: number
  month: number
}

/**
 * Records that the viewer has dismissed the banner for (year, month). Sets
 * `banner_dismissed_by_member_<a|b>_at` based on which side of the group
 * the viewer is. Idempotent — re-dismissing a row with timestamp set leaves
 * the original timestamp.
 *
 * Auto-clicking the CTA also goes through this action (UI calls it before
 * navigating), so the partner can still see the banner once.
 */
export async function dismissMonthlyReviewBanner(
  input: DismissMonthlyReviewBannerInput,
): Promise<void> {
  const { user, group } = await requireViewerGroup()

  const viewerIsA = group.memberA === user.id
  const viewerIsB = group.memberB === user.id
  if (!viewerIsA && !viewerIsB) {
    // Should be impossible (RLS would block) but guard for clarity.
    throw new Error('Unauthorized')
  }

  const setExpr = viewerIsA
    ? { bannerDismissedByMemberAAt: new Date() }
    : { bannerDismissedByMemberBAt: new Date() }

  await db
    .update(monthlyReviewSnapshots)
    .set(setExpr)
    .where(and(
      eq(monthlyReviewSnapshots.groupId, group.id),
      eq(monthlyReviewSnapshots.year, input.year),
      eq(monthlyReviewSnapshots.month, input.month),
      // Don't overwrite the original dismiss timestamp.
      viewerIsA
        ? isNull(monthlyReviewSnapshots.bannerDismissedByMemberAAt)
        : isNull(monthlyReviewSnapshots.bannerDismissedByMemberBAt),
    ))

  revalidatePath('/dashboard')
}
