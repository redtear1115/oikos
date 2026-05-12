import { db } from '@/lib/db/client'
import { assets } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

// getViewerGroup retired in favour of `requireViewerGroup` from
// `@/lib/auth/viewer` (#190). The membership + asset assertion helpers below
// are still recurring-action shaped and stay here.

export function assertMemberInGroup(
  memberId: string,
  group: { memberA: string; memberB: string | null },
  errorMessage: string,
): void {
  if (memberId !== group.memberA && memberId !== group.memberB) {
    throw new Error(errorMessage)
  }
}

export async function assertAssetInGroup(assetId: string, groupId: string): Promise<void> {
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.groupId, groupId)))
    .limit(1)
  if (!asset) throw new Error('關聯愛物不在家計簿內')
  if (asset.deletedAt) throw new Error('關聯愛物已刪除')
}
