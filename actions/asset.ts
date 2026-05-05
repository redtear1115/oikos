'use server'

import { db } from '@/lib/db/client'
import { assets, carDetails, cashTransactions, oikosGroups } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validateCarInput } from '@/lib/validators'
import { deriveTxnFromPrimaryUser } from '@/lib/primaryUser'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
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
  return { group, viewer: user }
}

export interface CreateCarInput {
  name: string
  plate: string
  purchasedAt?: string | null
  purchasePrice?: number | null
  primaryUserId?: string | null
  fuelType?: '95' | '98' | 'diesel' | 'electric'
}

/**
 * Atomically creates an Asset (type='car') + CarDetails. When `purchasePrice`
 * is supplied (>0), ALSO inserts a paired CashTransaction (category='transit',
 * description='購入 · {name}', fuel_log_id=NULL) under the same DB transaction
 * and recalcs the group balance — this is the "purchase" half of the Slice 2
 * dual-write contract. paidBy / splitType are derived from primaryUserId via
 * deriveTxnFromPrimaryUser (solo → all_mine; 共用 → half + viewer; otherwise
 * all_mine pointing at whoever the primary user is).
 *
 * transactedAt falls back to NOW() when purchasedAt is null (Q16 D1) — the
 * user explicitly opted to skip the date, so we anchor to creation time.
 */
export async function createCar(input: CreateCarInput): Promise<{ id: string }> {
  const validated = validateCarInput(input)
  const { group, viewer } = await getViewerGroup()

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
      primaryUserId: validated.primaryUserId,
      fuelType: validated.fuelType,
    })

    // Auto-create a paired purchase CashTransaction when purchasePrice was set.
    // validateCarInput already enforces `purchasePrice > 0` (positive integer)
    // when present, so the truthy check below is sufficient — no need to guard
    // against 0 separately.
    if (validated.purchasePrice) {
      const partnerId =
        group.memberB && group.memberB !== viewer.id
          ? group.memberB
          : group.memberA !== viewer.id
            ? group.memberA
            : null
      const partner = partnerId ? { id: partnerId } : null
      const { paidBy, splitType } = deriveTxnFromPrimaryUser(
        validated.primaryUserId,
        { id: viewer.id },
        partner,
      )

      await tx.insert(cashTransactions).values({
        groupId: group.id,
        assetId: asset.id,
        fuelLogId: null,
        paidBy,
        amount: validated.purchasePrice,
        splitType,
        category: 'transit',
        description: `購入 · ${validated.name}`,
        transactedAt: validated.purchasedAt
          ? new Date(`${validated.purchasedAt}T00:00:00`)
          : new Date(),
      })

      await recalcGroupBalance(group.id, tx)
    }

    return [asset]
  })

  revalidatePath('/assets')
  // Auto-tx affects /dashboard + /records too; revalidate unconditionally —
  // cheap, and keeps the call site simple.
  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}

export interface EditCarInput {
  id: string
  name: string
  plate: string
  purchasedAt: string | null
  purchasePrice: number | null
  primaryUserId?: string | null      // NEW — Slice 2
  fuelType?: '95' | '98' | 'diesel' | 'electric'  // NEW — Slice 2
}

export async function editCar(input: EditCarInput): Promise<void> {
  const validated = validateCarInput(input)
  const { group } = await getViewerGroup()

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
        primaryUserId: validated.primaryUserId,
        fuelType: validated.fuelType,
      })
      .where(eq(carDetails.assetId, input.id))
  })
  // Per spec E2: do NOT touch the linked purchase transaction (drift allowed)

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
  // Renamed car needs to flow to AddSheet's asset-picker label on the records page.
  revalidatePath('/records')
}

export async function softDeleteCar(id: string): Promise<void> {
  const { group } = await getViewerGroup()

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
  const { group } = await getViewerGroup()
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
  const { group } = await getViewerGroup()
  const row = await getAssetById(assetId, group.id)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    plate: row.plate,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}
