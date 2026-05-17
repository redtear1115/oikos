import { db } from '@/lib/db/client'
import { assets } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

/**
 * Assert that the given asset belongs to the active group and is not
 * soft-deleted. Used by write actions (transaction / income / recurring*) to
 * guard the optional `assetId` foreign key before insert.
 *
 * Error messages use the product term 「愛物」 per CLAUDE.md naming convention
 * — callers should not pass a custom message here (use direct assertion at the
 * callsite instead if you need a different surface).
 */
export async function assertAssetInGroup(assetId: string, groupId: string): Promise<void> {
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.groupId, groupId)))
    .limit(1)
  if (!asset) throw new Error('關聯愛物不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯愛物已刪除')
}
