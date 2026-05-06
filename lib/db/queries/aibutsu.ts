import { db } from '@/lib/db/client'
import { childDetails, petDetails, plantDetails, insuranceDetails, houseDetails, assets } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export interface ChildDetailsRow {
  birthday: string | null
  gender: 'male' | 'female' | 'other' | null
  nationalId: string | null
  nhiNo: string | null
  nickname: string | null
  hospital: string | null
  bloodType: string | null
  heightCm: number | null
  weightG: number | null
}

export async function getChildDetails(assetId: string): Promise<ChildDetailsRow | null> {
  const rows = await db
    .select({
      birthday: childDetails.birthday,
      gender: childDetails.gender,
      nationalId: childDetails.idNumberEncrypted,
      nhiNo: childDetails.insuranceIdEncrypted,
      nickname: childDetails.nickname,
      hospital: childDetails.hospital,
      bloodType: childDetails.bloodType,
      heightCm: childDetails.heightCm,
      weightG: childDetails.weightG,
    })
    .from(childDetails)
    .where(eq(childDetails.assetId, assetId))
    .limit(1)
  return rows[0] ?? null
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
  insurer: string | null
  annualPremium: number | null
  payCycle: string | null
  startsAt: string | null
  endsAt: string | null
  termYears: number | null
  sumInsured: number | null
  vehicleId: string | null
}

export async function getInsuranceDetails(assetId: string): Promise<InsuranceDetailsRow | null> {
  const rows = await db
    .select({
      policyNo: insuranceDetails.policyNumber,
      kind: insuranceDetails.insuranceType,
      insured: insuranceDetails.insured,
      insurer: insuranceDetails.insurer,
      annualPremium: insuranceDetails.annualPremium,
      payCycle: insuranceDetails.payCycle,
      startsAt: insuranceDetails.startsAt,
      endsAt: insuranceDetails.expiryDate,
      termYears: insuranceDetails.termYears,
      sumInsured: insuranceDetails.sumInsured,
      vehicleId: insuranceDetails.vehicleId,
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
