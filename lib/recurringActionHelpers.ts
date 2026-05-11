import { db } from '@/lib/db/client'
import { assets, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { and, eq, or } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'

export interface ViewerGroup {
  user: { id: string }
  group: typeof oikosGroups.$inferSelect
}

export async function getViewerGroup(): Promise<ViewerGroup> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const group = await getActiveGroupForUser(user.id)
  if (!group) throw new Error('找不到家計簿')
  return { user, group }
}

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
