import { db } from '@/lib/db/client'
import { alias } from 'drizzle-orm/pg-core'
import { childDetails, petDetails, plantDetails, insuranceDetails, houseDetails, assets, profiles } from '@/lib/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'

export interface PetListDetail {
  species: string | null
  breed: string | null
  birthDate: string | null
  weightG: number | null
}

/**
 * Batch-fetch pet list details (species, breed, birthDate, weightG) for a list
 * of pet asset ids. Returns a Map keyed by assetId.
 */
export async function getPetListDetailsBatch(assetIds: string[]): Promise<Map<string, PetListDetail>> {
  const out = new Map<string, PetListDetail>()
  if (assetIds.length === 0) return out
  const rows = await db
    .select({
      assetId: petDetails.assetId,
      species: petDetails.species,
      breed: petDetails.breed,
      birthDate: petDetails.birthDate,
      weightG: petDetails.weightG,
    })
    .from(petDetails)
    .where(inArray(petDetails.assetId, assetIds))
  for (const r of rows) {
    out.set(r.assetId, { species: r.species, breed: r.breed, birthDate: r.birthDate, weightG: r.weightG })
  }
  return out
}

export interface PlantListDetail {
  location: string | null
  sproutedAt: string | null
  waterEvery: number | null
}

/**
 * Batch-fetch plant list details (location, sproutedAt, waterEvery) for a list
 * of plant asset ids. Returns a Map keyed by assetId.
 */
export async function getPlantListDetailsBatch(assetIds: string[]): Promise<Map<string, PlantListDetail>> {
  const out = new Map<string, PlantListDetail>()
  if (assetIds.length === 0) return out
  const rows = await db
    .select({
      assetId: plantDetails.assetId,
      location: plantDetails.location,
      sproutedAt: plantDetails.sproutedAt,
      waterEvery: plantDetails.waterEvery,
    })
    .from(plantDetails)
    .where(inArray(plantDetails.assetId, assetIds))
  for (const r of rows) {
    out.set(r.assetId, { location: r.location, sproutedAt: r.sproutedAt, waterEvery: r.waterEvery })
  }
  return out
}

export interface ChildDetailsRow {
  birthday: string | null
  gender: 'male' | 'female' | 'other' | null
  // PII fields are end-to-end encrypted at rest (see actions/asset.ts:
  // createChild / editChild / revealChildPii). The detail page never receives
  // plaintext from this query — it gets booleans + a server action ("reveal")
  // for on-demand decryption. AssetSheet's edit form likewise starts these
  // fields blank (placeholder = "已加密儲存，留空即不變更").
  hasNationalId: boolean
  hasNhiNo: boolean
  nickname: string | null
  hospital: string | null
  bloodType: string | null
  heightCm: number | null
  weightG: number | null
}

/**
 * Batch-fetch nicknames for a list of child asset ids. Returns a Map keyed
 * by assetId. Missing rows / null nicknames are simply absent from the map.
 *
 * Used by the asset list page so list items can show nickname-first when
 * available without per-row queries.
 */
export async function getChildNicknames(assetIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (assetIds.length === 0) return out
  const rows = await db
    .select({ assetId: childDetails.assetId, nickname: childDetails.nickname })
    .from(childDetails)
    .where(inArray(childDetails.assetId, assetIds))
  for (const r of rows) {
    if (r.nickname && r.nickname.trim()) out.set(r.assetId, r.nickname)
  }
  return out
}

export async function getChildDetails(assetId: string): Promise<ChildDetailsRow | null> {
  const rows = await db
    .select({
      birthday: childDetails.birthday,
      gender: childDetails.gender,
      idNumberEncrypted: childDetails.idNumberEncrypted,
      insuranceIdEncrypted: childDetails.insuranceIdEncrypted,
      nickname: childDetails.nickname,
      hospital: childDetails.hospital,
      bloodType: childDetails.bloodType,
      heightCm: childDetails.heightCm,
      weightG: childDetails.weightG,
    })
    .from(childDetails)
    .where(eq(childDetails.assetId, assetId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  // Project ciphertext columns to booleans before returning so plaintext never
  // crosses the server/client boundary in any code path.
  return {
    birthday: row.birthday,
    gender: row.gender,
    hasNationalId: row.idNumberEncrypted !== null,
    hasNhiNo: row.insuranceIdEncrypted !== null,
    nickname: row.nickname,
    hospital: row.hospital,
    bloodType: row.bloodType,
    heightCm: row.heightCm,
    weightG: row.weightG,
  }
}

export interface PetDetailsRow {
  species: string | null
  breed: string | null
  sex: string | null
  birthDate: string | null
  adoptedDate: string | null
  purchaseCost: number | null
  weightG: number | null
  chipNo: string | null
  vet: string | null
}

export async function getPetDetails(assetId: string): Promise<PetDetailsRow | null> {
  const rows = await db
    .select({
      species: petDetails.species,
      breed: petDetails.breed,
      sex: petDetails.sex,
      birthDate: petDetails.birthDate,
      adoptedDate: petDetails.adoptedDate,
      purchaseCost: petDetails.purchaseCost,
      weightG: petDetails.weightG,
      chipNo: petDetails.chipNo,
      vet: petDetails.vet,
    })
    .from(petDetails)
    .where(eq(petDetails.assetId, assetId))
    .limit(1)
  return rows[0] ?? null
}

export interface PlantDetailsRow {
  species: string | null
  location: string | null
  sproutedAt: string | null
  cost: number | null
  waterEvery: number | null
}

export async function getPlantDetails(assetId: string): Promise<PlantDetailsRow | null> {
  const rows = await db
    .select({
      species: plantDetails.species,
      location: plantDetails.location,
      sproutedAt: plantDetails.sproutedAt,
      cost: plantDetails.cost,
      waterEvery: plantDetails.waterEvery,
    })
    .from(plantDetails)
    .where(eq(plantDetails.assetId, assetId))
    .limit(1)
  return rows[0] ?? null
}

export interface InsuranceDetailsRow {
  policyNo: string | null
  kind: string | null
  insured: string | null
  insuredChildId: string | null
  insuredChildName: string | null
  insuredUserId: string | null
  insuredUserDisplayName: string | null
  policyHolderUserId: string | null
  insurer: string | null
  annualPremium: number | null
  payCycle: string | null
  startsAt: string | null
  endsAt: string | null
  termYears: number | null
  sumInsured: number | null
  vehicleId: string | null
  expectedMaturityAmount: number | null
  accountValue: number | null
}

export async function getInsuranceDetails(assetId: string): Promise<InsuranceDetailsRow | null> {
  // #167 — LEFT JOIN the linked Child asset so the detail page can show the
  // child's name without an extra round-trip. NULL when insured_child_id is
  // unset or the child was hard-deleted (FK is RESTRICT but soft-delete
  // doesn't break the join).
  // #237 — same pattern for insured_user_id so the detail page can render
  // the member's displayName when 被保人 is 自己 / 對方.
  const insuredChildAsset = alias(assets, 'insured_child_asset')
  const insuredUserProfile = alias(profiles, 'insured_user_profile')
  const rows = await db
    .select({
      policyNo: insuranceDetails.policyNumber,
      kind: insuranceDetails.insuranceType,
      insured: insuranceDetails.insured,
      insuredChildId: insuranceDetails.insuredChildId,
      insuredChildName: insuredChildAsset.name,
      insuredUserId: insuranceDetails.insuredUserId,
      insuredUserDisplayName: insuredUserProfile.displayName,
      policyHolderUserId: insuranceDetails.policyHolderUserId,
      insurer: insuranceDetails.insurer,
      annualPremium: insuranceDetails.annualPremium,
      payCycle: insuranceDetails.payCycle,
      startsAt: insuranceDetails.startsAt,
      endsAt: insuranceDetails.expiryDate,
      termYears: insuranceDetails.termYears,
      sumInsured: insuranceDetails.sumInsured,
      vehicleId: insuranceDetails.vehicleId,
      expectedMaturityAmount: insuranceDetails.expectedMaturityAmount,
      accountValue: insuranceDetails.accountValue,
    })
    .from(insuranceDetails)
    .leftJoin(insuredChildAsset, eq(insuredChildAsset.id, insuranceDetails.insuredChildId))
    .leftJoin(insuredUserProfile, eq(insuredUserProfile.id, insuranceDetails.insuredUserId))
    .where(eq(insuranceDetails.assetId, assetId))
    .limit(1)
  return rows[0] ?? null
}

export async function getLinkedInsurancesForVehicle(vehicleId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: assets.id, name: assets.name })
    .from(assets)
    .innerJoin(insuranceDetails, eq(insuranceDetails.assetId, assets.id))
    .where(and(
      eq(insuranceDetails.vehicleId, vehicleId),
      isNull(assets.deletedAt),
    ))
}

export interface HouseDetailsRow {
  owner: string
  address: string | null
  purchasedAt: string | null
  purchasePrice: number | null
}

export async function getHouseDetails(assetId: string): Promise<HouseDetailsRow | null> {
  const rows = await db
    .select({
      owner: houseDetails.owner,
      address: houseDetails.address,
      purchasedAt: houseDetails.purchasedAt,
      purchasePrice: houseDetails.purchasePrice,
    })
    .from(houseDetails)
    .where(eq(houseDetails.assetId, assetId))
    .limit(1)
  return rows[0] ?? null
}
