'use server'

import { db } from '@/lib/db/client'
import { assets, carDetails, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validateCarInput, validateLifeEntityInput } from '@/lib/validators'
import { eq, or, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { listAssetsForGroup, getAssetById } from '@/lib/db/queries/asset'

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
  // Renamed car needs to flow to AddSheet's asset-picker label on the records page.
  revalidatePath('/records')
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
      eq(assets.type, 'car'),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw new Error('找不到該資產')

  revalidatePath('/assets')
  // Defense-in-depth: a partner viewing the detail page primarily redirects
  // via the realtime asset-changed event, but if the WebSocket dropped, this
  // ensures the next nav reads fresh state and notFound()s cleanly.
  revalidatePath(`/assets/${id}`)
  revalidatePath('/records')
}

// ── Life entity (child / pet / plant) ─────────────────────────────────────

export interface CreateLifeEntityInput {
  type: 'child' | 'pet' | 'plant'
  name: string
}

export async function createLifeEntity(input: CreateLifeEntityInput): Promise<{ id: string }> {
  const validated = validateLifeEntityInput(input)
  const group = await getViewerGroup()

  const [created] = await db
    .insert(assets)
    .values({ groupId: group.id, type: validated.type, name: validated.name })
    .returning({ id: assets.id })

  revalidatePath('/assets')
  return { id: created.id }
}

export interface EditLifeEntityInput {
  id: string
  name: string
}

export async function editLifeEntity(input: EditLifeEntityInput): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new Error('名稱不可為空')
  const group = await getViewerGroup()

  const updated = await db
    .update(assets)
    .set({ name })
    .where(and(
      eq(assets.id, input.id),
      eq(assets.groupId, group.id),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw new Error('找不到該愛物')

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}

export async function softDeleteAsset(assetId: string): Promise<void> {
  const group = await getViewerGroup()

  const updated = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(assets.id, assetId),
      eq(assets.groupId, group.id),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw new Error('找不到該愛物')

  revalidatePath('/assets')
}

export interface PickerAsset {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance'
  name: string
  plate: string | null
}

/**
 * Lightweight asset list for AssetPickerSheet — name + plate only, excludes
 * deleted assets (new transaction links can never point at zombies).
 */
export async function loadAssetsForPicker(): Promise<PickerAsset[]> {
  const group = await getViewerGroup()
  const rows = await listAssetsForGroup(group.id)
  return rows.map(r => ({ id: r.id, type: r.type, name: r.name, plate: r.plate }))
}

export interface LoadedAsset {
  id: string
  name: string
  plate: string | null
  deletedAt: string | null  // ISO
}

/**
 * Loads a single asset for display (e.g. AddSheet's "關聯資產" row showing
 * "我的 Tesla（已刪除）"). Returns null if not found or wrong group.
 */
export async function loadAsset(assetId: string): Promise<LoadedAsset | null> {
  const group = await getViewerGroup()
  const row = await getAssetById(assetId, group.id)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    plate: row.plate,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}
