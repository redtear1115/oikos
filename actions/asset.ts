'use server'

import { db } from '@/lib/db/client'
import { assets, carDetails, cashTransactions, oikosGroups, childDetails, petDetails, plantDetails, insuranceDetails, houseDetails } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { validateCarInput, validateLifeEntityInput, validateChildInput, validatePetInput, validatePlantInput, validateInsuranceInput, validateHouseInput } from '@/lib/validators'
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
  fuelType?: '92' | '95' | '98' | 'diesel'
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
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
      color: validated.color,
      year: validated.year,
      brand: validated.brand,
      model: validated.model,
      initialOdometer: validated.initialOdometer,
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
  fuelType?: '92' | '95' | '98' | 'diesel'
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
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
        color: validated.color,
        year: validated.year,
        brand: validated.brand,
        model: validated.model,
        initialOdometer: validated.initialOdometer,
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

// ── Life entity (child / pet / plant) ─────────────────────────────────────

export interface CreateLifeEntityInput {
  type: 'child' | 'pet' | 'plant'
  name: string
}

export async function createLifeEntity(input: CreateLifeEntityInput): Promise<{ id: string }> {
  const validated = validateLifeEntityInput(input)
  const { group } = await getViewerGroup()

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
  // Reuse validator for consistent name trimming + length check
  // type field is irrelevant for edit; 'pet' is used as a placeholder
  const { name } = validateLifeEntityInput({ type: 'pet', name: input.name })
  const { group } = await getViewerGroup()

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
  const { group } = await getViewerGroup()

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
  revalidatePath(`/assets/${assetId}`)
  revalidatePath('/records')
}

export interface PickerAsset {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  name: string
  plate: string | null
}

export interface CarAsset {
  id: string
  name: string
  plate: string | null
}

/**
 * Returns all non-deleted car assets for the viewer's group.
 * Used by the insurance form vehicle picker.
 */
export async function getCarAssets(): Promise<CarAsset[]> {
  const { group } = await getViewerGroup()
  const rows = await listAssetsForGroup(group.id)
  return rows
    .filter(r => r.type === 'car')
    .map(r => ({ id: r.id, name: r.name, plate: r.plate }))
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

// ── Child ──────────────────────────────────────────────────────────────────

export interface CreateChildInput {
  name: string
  nickname?: string | null
  gender?: 'male' | 'female' | 'other' | null
  birthday?: string | null
  nationalId?: string | null
  nhiNo?: string | null
  bloodType?: string | null
  hospital?: string | null
  heightCm?: number | null
  weightG?: number | null
}

export interface EditChildInput extends CreateChildInput {
  id: string
}

export async function createChild(input: CreateChildInput): Promise<{ id: string }> {
  'use server'
  const validated = validateChildInput(input)
  const { group } = await getViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'child', name: validated.name })
      .returning({ id: assets.id })
    await tx.insert(childDetails).values({
      assetId: asset.id,
      birthday: validated.birthday,
      gender: validated.gender,
      idNumberEncrypted: validated.nationalId,
      insuranceIdEncrypted: validated.nhiNo,
      nickname: validated.nickname,
      hospital: validated.hospital,
      bloodType: validated.bloodType,
      heightCm: validated.heightCm,
      weightG: validated.weightG,
    })
    return [asset]
  })

  revalidatePath('/assets')
  return { id: created.id }
}

export async function editChild(input: EditChildInput): Promise<void> {
  'use server'
  const validated = validateChildInput(input)
  const { group } = await getViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'child'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw new Error('找不到該愛物')

    await tx
      .insert(childDetails)
      .values({
        assetId: input.id,
        birthday: validated.birthday,
        gender: validated.gender,
        idNumberEncrypted: validated.nationalId,
        insuranceIdEncrypted: validated.nhiNo,
        nickname: validated.nickname,
        hospital: validated.hospital,
        bloodType: validated.bloodType,
        heightCm: validated.heightCm,
        weightG: validated.weightG,
      })
      .onConflictDoUpdate({
        target: childDetails.assetId,
        set: {
          birthday: validated.birthday,
          gender: validated.gender,
          idNumberEncrypted: validated.nationalId,
          insuranceIdEncrypted: validated.nhiNo,
          nickname: validated.nickname,
          hospital: validated.hospital,
          bloodType: validated.bloodType,
          heightCm: validated.heightCm,
          weightG: validated.weightG,
        },
      })
  })

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}

// ── Pet ────────────────────────────────────────────────────────────────────

export interface CreatePetInput {
  name: string
  species?: string | null
  breed?: string | null
  sex?: string | null
  birthDate?: string | null
  adoptedDate?: string | null
  purchaseCost?: number | null
  weightG?: number | null
  chipNo?: string | null
  vet?: string | null
}

export interface EditPetInput extends CreatePetInput {
  id: string
}

export async function createPet(input: CreatePetInput): Promise<{ id: string }> {
  'use server'
  const validated = validatePetInput(input)
  const { group } = await getViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'pet', name: validated.name })
      .returning({ id: assets.id })
    await tx.insert(petDetails).values({
      assetId: asset.id,
      species: validated.species,
      breed: validated.breed,
      sex: validated.sex,
      birthDate: validated.birthDate,
      adoptedDate: validated.adoptedDate,
      purchaseCost: validated.purchaseCost,
      weightG: validated.weightG,
      chipNo: validated.chipNo,
      vet: validated.vet,
    })
    return [asset]
  })

  revalidatePath('/assets')
  return { id: created.id }
}

export async function editPet(input: EditPetInput): Promise<void> {
  'use server'
  const validated = validatePetInput(input)
  const { group } = await getViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'pet'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw new Error('找不到該愛物')

    await tx
      .insert(petDetails)
      .values({
        assetId: input.id,
        species: validated.species,
        breed: validated.breed,
        sex: validated.sex,
        birthDate: validated.birthDate,
        adoptedDate: validated.adoptedDate,
        purchaseCost: validated.purchaseCost,
        weightG: validated.weightG,
        chipNo: validated.chipNo,
        vet: validated.vet,
      })
      .onConflictDoUpdate({
        target: petDetails.assetId,
        set: {
          species: validated.species,
          breed: validated.breed,
          sex: validated.sex,
          birthDate: validated.birthDate,
          adoptedDate: validated.adoptedDate,
          purchaseCost: validated.purchaseCost,
          weightG: validated.weightG,
          chipNo: validated.chipNo,
          vet: validated.vet,
        },
      })
  })

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}

// ── Plant ──────────────────────────────────────────────────────────────────

export interface CreatePlantInput {
  name: string
  species?: string | null
  location?: string | null
  sproutedAt?: string | null
  cost?: number | null
  waterEvery?: number | null
}

export interface EditPlantInput extends CreatePlantInput {
  id: string
}

export async function createPlant(input: CreatePlantInput): Promise<{ id: string }> {
  'use server'
  const validated = validatePlantInput(input)
  const { group } = await getViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'plant', name: validated.name })
      .returning({ id: assets.id })
    await tx.insert(plantDetails).values({
      assetId: asset.id,
      species: validated.species,
      location: validated.location,
      sproutedAt: validated.sproutedAt,
      cost: validated.cost,
      waterEvery: validated.waterEvery,
    })
    return [asset]
  })

  revalidatePath('/assets')
  return { id: created.id }
}

export async function editPlant(input: EditPlantInput): Promise<void> {
  'use server'
  const validated = validatePlantInput(input)
  const { group } = await getViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'plant'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw new Error('找不到該愛物')

    await tx
      .insert(plantDetails)
      .values({
        assetId: input.id,
        species: validated.species,
        location: validated.location,
        sproutedAt: validated.sproutedAt,
        cost: validated.cost,
        waterEvery: validated.waterEvery,
      })
      .onConflictDoUpdate({
        target: plantDetails.assetId,
        set: {
          species: validated.species,
          location: validated.location,
          sproutedAt: validated.sproutedAt,
          cost: validated.cost,
          waterEvery: validated.waterEvery,
        },
      })
  })

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}

// ── Insurance ──────────────────────────────────────────────────────────────

export interface CreateInsuranceInput {
  name: string
  kind?: string | null
  insured?: string | null
  insurer?: string | null
  policyNo?: string | null
  annualPremium?: number | null
  sumInsured?: number | null
  payCycle?: string | null
  startsAt?: string | null
  endsAt?: string | null
  termYears?: number | null
  vehicleId?: string | null
}

export interface EditInsuranceInput extends CreateInsuranceInput {
  id: string
}

export async function createInsurance(input: CreateInsuranceInput): Promise<{ id: string }> {
  'use server'
  const validated = validateInsuranceInput(input)
  const { group } = await getViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'insurance', name: validated.name })
      .returning({ id: assets.id })
    await tx.insert(insuranceDetails).values({
      assetId: asset.id,
      insuranceType: validated.kind,
      insured: validated.insured,
      insurer: validated.insurer,
      policyNumber: validated.policyNo,
      annualPremium: validated.annualPremium,
      sumInsured: validated.sumInsured,
      payCycle: validated.payCycle,
      startsAt: validated.startsAt,
      expiryDate: validated.endsAt,
      termYears: validated.termYears,
      insuredType: 'user',
      vehicleId: input.vehicleId ?? null,
    })
    return [asset]
  })

  revalidatePath('/assets')
  return { id: created.id }
}

export async function editInsurance(input: EditInsuranceInput): Promise<void> {
  'use server'
  const validated = validateInsuranceInput(input)
  const { group } = await getViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'insurance'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw new Error('找不到該愛物')

    await tx
      .insert(insuranceDetails)
      .values({
        assetId: input.id,
        insuranceType: validated.kind,
        insured: validated.insured,
        insurer: validated.insurer,
        policyNumber: validated.policyNo,
        annualPremium: validated.annualPremium,
        sumInsured: validated.sumInsured,
        payCycle: validated.payCycle,
        startsAt: validated.startsAt,
        expiryDate: validated.endsAt,
        termYears: validated.termYears,
        insuredType: 'user',
        vehicleId: input.vehicleId ?? null,
      })
      .onConflictDoUpdate({
        target: insuranceDetails.assetId,
        set: {
          insuranceType: validated.kind,
          insured: validated.insured,
          insurer: validated.insurer,
          policyNumber: validated.policyNo,
          annualPremium: validated.annualPremium,
          sumInsured: validated.sumInsured,
          payCycle: validated.payCycle,
          startsAt: validated.startsAt,
          expiryDate: validated.endsAt,
          termYears: validated.termYears,
          vehicleId: input.vehicleId ?? null,
        },
      })
  })

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}

// ── House ──────────────────────────────────────────────────────────────────

export interface CreateHouseInput {
  name: string
  address?: string | null
  purchasedAt?: string | null
  purchasePrice?: number | null
}

export async function createHouse(input: CreateHouseInput): Promise<{ id: string }> {
  'use server'
  const validated = validateHouseInput(input)
  const { group, viewer } = await getViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'house', name: validated.name })
      .returning({ id: assets.id })
    await tx.insert(houseDetails).values({
      assetId: asset.id,
      owner: viewer.id,
      address: validated.address,
      purchasedAt: validated.purchasedAt,
      purchasePrice: validated.purchasePrice,
    })

    if (validated.purchasePrice) {
      const partnerId =
        group.memberB && group.memberB !== viewer.id
          ? group.memberB
          : group.memberA !== viewer.id
            ? group.memberA
            : null
      const partner = partnerId ? { id: partnerId } : null
      const { paidBy, splitType } = deriveTxnFromPrimaryUser(
        viewer.id,
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
        category: 'housing',
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
  revalidatePath('/dashboard')
  revalidatePath('/records')
  return { id: created.id }
}

export interface EditHouseInput {
  id: string
  name: string
  address?: string | null
  purchasedAt?: string | null
  purchasePrice?: number | null
}

export async function editHouse(input: EditHouseInput): Promise<void> {
  'use server'
  const validated = validateHouseInput(input)
  const { group } = await getViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'house'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw new Error('找不到該愛物')

    await tx
      .update(houseDetails)
      .set({
        address: validated.address,
        purchasedAt: validated.purchasedAt,
        purchasePrice: validated.purchasePrice,
      })
      .where(eq(houseDetails.assetId, input.id))
  })

  revalidatePath('/assets')
  revalidatePath(`/assets/${input.id}`)
}
