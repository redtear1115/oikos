import { db } from '@/lib/db/client'
import { childDetails, petDetails, plantDetails, insuranceDetails, houseDetails, assets } from '@/lib/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'

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
  insuredUserId: string | null
  insurer: string | null
  annualPremium: number | null
  payCycle: string | null
  startsAt: string | null
  endsAt: string | null
  termYears: number | null
  sumInsured: number | null
  vehicleId: string | null
  expectedMaturityAmount: number | null
}

export async function getInsuranceDetails(assetId: string): Promise<InsuranceDetailsRow | null> {
  const rows = await db
    .select({
      policyNo: insuranceDetails.policyNumber,
      kind: insuranceDetails.insuranceType,
      insured: insuranceDetails.insured,
      insuredUserId: insuranceDetails.insuredUserId,
      insurer: insuranceDetails.insurer,
      annualPremium: insuranceDetails.annualPremium,
      payCycle: insuranceDetails.payCycle,
      startsAt: insuranceDetails.startsAt,
      endsAt: insuranceDetails.expiryDate,
      termYears: insuranceDetails.termYears,
      sumInsured: insuranceDetails.sumInsured,
      vehicleId: insuranceDetails.vehicleId,
      expectedMaturityAmount: insuranceDetails.expectedMaturityAmount,
    })
    .from(insuranceDetails)
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
