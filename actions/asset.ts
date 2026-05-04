'use server'

import { db } from '@/lib/db/client'
import { assets, carDetails, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validateCarInput } from '@/lib/validators'
import { eq, or, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

async function getViewerGroup() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('找不到家計簿')
  return group
}

export interface CreateCarInput {
  name: string
  plate: string
  purchasedAt?: string | null
  purchasePrice?: number | null
}

export async function createCar(input: CreateCarInput): Promise<{ id: string }> {
  const validated = validateCarInput(input)
  const group = await getViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'car', name: validated.name })
      .returning({ id: assets.id })
    await tx.insert(carDetails).values({
      assetId: asset.id,
      plate: validated.plate,
      purchasedAt: validated.purchasedAt,
      purchasePrice: validated.purchasePrice,
    })
    return [asset]
  })

  revalidatePath('/assets')
  return { id: created.id }
}

export interface EditCarInput {
  id: string
  name: string
  plate: string
  purchasedAt: string | null
  purchasePrice: number | null
}

export async function editCar(input: EditCarInput): Promise<void> {
  const validated = validateCarInput(input)
  const group = await getViewerGroup()

  await db.transaction(async (tx) => {
    // UPDATE Asset; .returning proves ownership (group_id match + not deleted)
    const updated = await tx
      .update(assets)
      .set({ name: validated.name })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'car'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw new Error('找不到該資產')

    await tx
      .update(carDetails)
      .set({
        plate: validated.plate,
        purchasedAt: validated.purchasedAt,
        purchasePrice: validated.purchasePrice,
      })
      .where(eq(carDetails.assetId, input.id))
  })

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}

export async function softDeleteCar(id: string): Promise<void> {
  const group = await getViewerGroup()

  // Soft delete the Asset row only. Do NOT touch CashTransactions.asset_id —
  // per spec Q7-A we preserve the historical link and let AddSheet display
  // "(已刪除)" when a transaction still references this asset.
  const updated = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(assets.id, id),
      eq(assets.groupId, group.id),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw new Error('找不到該資產')

  revalidatePath('/assets')
  revalidatePath('/records')
}
