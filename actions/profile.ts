'use server'

import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { requireViewer } from '@/lib/auth/viewer'
import { revalidateAfterProfileMutation } from '@/lib/revalidate'
import { validateName } from '@/lib/validators'
import type { SplitType } from '@/lib/balance'

export async function updateDisplayName(name: string): Promise<{ ok: true }> {
  const { user } = await requireViewer()

  const trimmed = validateName(name, '顯示名稱')

  const result = await db
    .update(profiles)
    .set({ displayName: trimmed })
    .where(eq(profiles.id, user.id))
    .returning({ id: profiles.id })

  if (result.length === 0) throw new Error('找不到個人資料')

  // Display name shows in headers / rows across the app.
  revalidateAfterProfileMutation()
  return { ok: true }
}

const VALID_SPLIT_TYPES: ReadonlyArray<SplitType> = ['all_mine', 'all_theirs', 'half']

export async function updateDefaultSplitType(splitType: SplitType): Promise<{ ok: true }> {
  const { user } = await requireViewer()

  if (!VALID_SPLIT_TYPES.includes(splitType)) {
    throw new Error('分攤方式無效')
  }

  const result = await db
    .update(profiles)
    .set({ defaultSplitType: splitType })
    .where(eq(profiles.id, user.id))
    .returning({ id: profiles.id })

  if (result.length === 0) throw new Error('找不到個人資料')

  revalidateAfterProfileMutation()
  return { ok: true }
}
