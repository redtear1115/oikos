'use server'

import { db } from '@/lib/db/client'
import { oikosGroups, groupBalance } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { eq, or } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { revalidatePath } from 'next/cache'
import { validateName } from '@/lib/validators'

export async function getMyGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const group = await getActiveGroupForUser(user.id)

  return group ?? null
}

export async function createGroup(name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const existing = await getActiveGroupForUser(user.id)

  if (existing) throw new Error('Already in a group')

  const [group] = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(oikosGroups)
      .values({ name, memberA: user.id })
      .returning()

    await tx.insert(groupBalance).values({
      groupId: g.id,
      balance: 0,
      version: 0,
    })

    return [g]
  })

  return group
}

export async function updateGroupName(name: string): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const trimmed = validateName(name, '帳本名稱')

  const active = await getActiveGroupForUser(user.id)
  if (!active) throw new Error('找不到家計簿')

  await db
    .update(oikosGroups)
    .set({ name: trimmed })
    .where(eq(oikosGroups.id, active.id))

  revalidatePath('/settings')
  return { ok: true }
}

export async function updateGroupSplitRatio(ratioA: number): Promise<{ ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  if (!Number.isInteger(ratioA) || ratioA < 1 || ratioA > 99) {
    throw new Error('分攤比例必須為 1–99 的整數')
  }

  const active = await getActiveGroupForUser(user.id)
  if (!active) throw new Error('找不到家計簿')

  await db
    .update(oikosGroups)
    .set({ defaultSplitRatioA: ratioA })
    .where(eq(oikosGroups.id, active.id))

  revalidatePath('/settings')
  return { ok: true }
}
