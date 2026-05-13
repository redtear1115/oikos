'use server'

import { db } from '@/lib/db/client'
import { oikosGroups, groupBalance } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { eq } from 'drizzle-orm'
import { getActiveGroupForUser } from '@/lib/db/queries/group'
import { requireViewer, requireViewerGroup } from '@/lib/auth/viewer'
import { revalidateSettings } from '@/lib/revalidate'
import { revalidatePath } from 'next/cache'
import { validateName } from '@/lib/validators'

export async function getMyGroup() {
  // Read-only "is the viewer in a group?" probe used by client RTV bootstrap.
  // Returns null (rather than throwing) on no-user so the caller can render
  // the unauth state without a try/catch.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const group = await getActiveGroupForUser(user.id)

  return group ?? null
}

export async function createGroup(name: string) {
  const { user } = await requireViewer()

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
  const trimmed = validateName(name, '帳本名稱')

  const { group } = await requireViewerGroup()

  await db
    .update(oikosGroups)
    .set({ name: trimmed })
    .where(eq(oikosGroups.id, group.id))

  revalidateSettings()
  return { ok: true }
}

export async function updateGroupSplitRatio(ratioA: number): Promise<{ ok: true }> {
  if (!Number.isInteger(ratioA) || ratioA < 1 || ratioA > 99) {
    throw new Error('分攤比例必須為 1–99 的整數')
  }

  const { group } = await requireViewerGroup()

  await db
    .update(oikosGroups)
    .set({ defaultSplitRatioA: ratioA })
    .where(eq(oikosGroups.id, group.id))

  revalidateSettings()
  return { ok: true }
}

/**
 * #220 — flip Guardian (守護) beta on/off for the viewer's group.
 * `requireViewerGroup()` already gates on viewer membership, so we don't
 * accept a `groupId` arg: the only group the viewer can mutate is their own.
 * Revalidates everywhere Guardian surfaces — settings (toggle row), assets
 * (tab visibility), dashboard (in case a future tile shows up there).
 */
export async function toggleGuardianBeta(enabled: boolean): Promise<{ ok: true }> {
  const { group } = await requireViewerGroup()

  await db
    .update(oikosGroups)
    .set({ guardianBetaEnabled: enabled })
    .where(eq(oikosGroups.id, group.id))

  revalidatePath('/settings')
  revalidatePath('/assets')
  revalidatePath('/dashboard')
  return { ok: true }
}
