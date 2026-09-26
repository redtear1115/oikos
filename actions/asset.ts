'use server'

import { db } from '@/lib/db/client'
import { assets, carDetails, cashTransactions, childDetails, petDetails, plantDetails, insuranceDetails, houseDetails } from '@/lib/db/schema'
import { validateCarInput, validateLifeEntityInput, validateChildInput, validatePetInput, validatePlantInput, validateInsuranceInput, validateHouseInput, validateName, validateNotes } from '@/lib/validators'
import { deriveTxnFromPrimaryUser } from '@/lib/primaryUser'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { randomUUID } from 'crypto'
import { encrypt, decrypt, aadFor, type AadContext } from '@/lib/crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { getViewerWriteContext } from '@/lib/actionContext'
import { revalidateAfterAssetMutation } from '@/lib/revalidate'
import { listAssetsForGroup, getAssetById } from '@/lib/db/queries/asset'
import { isAssetTemplateKey, validateTemplateFields, type AssetTemplateKey } from '@/lib/assetTemplates'
import { canAccessGuardian } from '@/lib/guardian'
import { captureServer, isUserFirstNonDeletedRecord } from '@/lib/analytics/server'
import type { AssetType } from '@/lib/assets'
import type { GasFuelType } from '@/lib/fuel'
import { action, actionError } from '@/lib/action-errors'

function assertPolicyHolderInGroup(
  userId: string,
  group: { memberA: string; memberB: string | null },
): void {
  if (userId !== group.memberA && userId !== group.memberB) {
    throw actionError('policyholder_not_member')
  }
}

// #237 — 被保人 can be a group member (自己 / 對方). Mirrors the policy holder
// guard. Distinct error message so the user can tell which field is wrong if
// both happen to be misconfigured at once.
function assertInsuredUserInGroup(
  userId: string,
  group: { memberA: string; memberB: string | null },
): void {
  if (userId !== group.memberA && userId !== group.memberB) {
    throw actionError('insured_not_member')
  }
}

export interface CreateCarInput {
  name: string
  plate: string
  purchasedAt?: string | null
  purchasePrice?: number | null
  primaryUserId?: string | null
  fuelType?: GasFuelType
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
  notes?: string | null
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
export const createCar = action(async (input: CreateCarInput): Promise<{ id: string }> => {
  const validated = validateCarInput(input)
  // #837 — plate is required on create (the form enforces it too); the
  // validator's trinary only yields a string when a value was supplied.
  // Checked before auth so a blank plate fails fast, matching the old
  // validate-then-reject ordering. Captured into a local so the narrowing
  // survives into the transaction closure below.
  if (typeof validated.plate !== 'string') throw actionError('plate_empty')
  const plate = validated.plate

  // Records a purchase CashTransaction when purchasePrice is set, so it goes
  // through the same past-chapter write gate as every other ledger write.
  const { user: viewer, group } = await getViewerWriteContext()

  const { created, firstRecord } = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'car', name: validated.name, notes: validated.notes })
      .returning({ id: assets.id })
    await tx.insert(carDetails).values({
      assetId: asset.id,
      // #837 — encrypted column is the only store; legacy `plate` was dropped.
      plateEncrypted: encrypt(plate, aadFor('CarDetails', 'plate_encrypted', asset.id)),
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
    let firstRecord = false
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
      firstRecord = await isUserFirstNonDeletedRecord(tx, viewer.id, group.id)
    }

    return { created: asset, firstRecord }
  })

  // Auto-tx affects /dashboard + /records too; revalidate unconditionally —
  // cheap, and keeps the call site simple.
  revalidateAfterAssetMutation(null, { affectsRecords: true, affectsDashboard: true })

  // Milestone signal (#891, not the activation metric — see #1127): purchase pair may be the viewer's first record.
  if (firstRecord) {
    await captureServer(viewer.id, 'first_record_created', { via: 'asset_purchase' })
  }
  // Feature-adoption signal (#815).
  await captureServer(viewer.id, 'asset_created', { asset_type: 'car' })

  return { id: created.id }
})

export interface EditCarInput {
  id: string
  name: string
  // #837 — plate trinary: undefined = keep existing encrypted value,
  // null = clear, string = set. The form never receives plaintext.
  plate?: string | null
  purchasedAt: string | null
  purchasePrice: number | null
  primaryUserId?: string | null      // NEW — Slice 2
  fuelType?: GasFuelType
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
  notes?: string | null
}

export const editCar = action(async (input: EditCarInput): Promise<void> => {
  const validated = validateCarInput(input)
  const { group } = await requireViewerGroup()

  await db.transaction(async (tx) => {
    // UPDATE Asset; .returning proves ownership (group_id match + not deleted)
    const updated = await tx
      .update(assets)
      .set({ name: validated.name, notes: validated.notes })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'car'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw actionError('asset_not_found')

    // #837 — plate trinary: only touch plate_encrypted when the form supplied a
    // value (string = encrypt+set, null = clear). undefined leaves it intact —
    // the form starts blank because we never hand plaintext to the client, so
    // an unedited plate field must not wipe the stored value.
    const carUpdates: {
      purchasedAt: string | null
      purchasePrice: number | null
      primaryUserId: string | null
      fuelType: typeof validated.fuelType
      color: string | null
      year: number | null
      brand: string | null
      model: string | null
      initialOdometer: number | null
      plateEncrypted?: string | null
    } = {
      purchasedAt: validated.purchasedAt,
      purchasePrice: validated.purchasePrice,
      primaryUserId: validated.primaryUserId,
      fuelType: validated.fuelType,
      color: validated.color,
      year: validated.year,
      brand: validated.brand,
      model: validated.model,
      initialOdometer: validated.initialOdometer,
    }
    if (validated.plate !== undefined) {
      carUpdates.plateEncrypted = validated.plate === null ? null : encrypt(validated.plate, aadFor('CarDetails', 'plate_encrypted', updated[0].id))
    }

    await tx
      .update(carDetails)
      .set(carUpdates)
      .where(eq(carDetails.assetId, input.id))
  })
  // Per spec E2: do NOT touch the linked purchase transaction (drift allowed)

  // Renamed car needs to flow to AddSheet's asset-picker label on the records page.
  revalidateAfterAssetMutation(input.id, { affectsRecords: true })
})

export const softDeleteCar = action(async (id: string): Promise<void> => {
  const { group } = await requireViewerGroup()

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
  if (updated.length === 0) throw actionError('asset_not_found')

  // Defense-in-depth: a partner viewing the detail page primarily redirects
  // via the realtime asset-changed event, but if the WebSocket dropped, the
  // /assets/${id} bust ensures the next nav reads fresh state and notFound()s
  // cleanly.
  revalidateAfterAssetMutation(id, { affectsRecords: true })
})

// ── Life entity (child / pet / plant) ─────────────────────────────────────

export interface CreateLifeEntityInput {
  type: 'child' | 'pet' | 'plant'
  name: string
}

export const createLifeEntity = action(async (input: CreateLifeEntityInput): Promise<{ id: string }> => {
  const validated = validateLifeEntityInput(input)
  const { user, group } = await requireViewerGroup()

  const [created] = await db
    .insert(assets)
    .values({ groupId: group.id, type: validated.type, name: validated.name })
    .returning({ id: assets.id })

  revalidateAfterAssetMutation()
  await captureServer(user.id, 'asset_created', { asset_type: validated.type })
  return { id: created.id }
})

export interface EditLifeEntityInput {
  id: string
  name: string
}

export const editLifeEntity = action(async (input: EditLifeEntityInput): Promise<void> => {
  // Reuse validator for consistent name trimming + length check
  // type field is irrelevant for edit; 'pet' is used as a placeholder
  const { name } = validateLifeEntityInput({ type: 'pet', name: input.name })
  const { group } = await requireViewerGroup()

  const updated = await db
    .update(assets)
    .set({ name })
    .where(and(
      eq(assets.id, input.id),
      eq(assets.groupId, group.id),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw actionError('aibutsu_not_found')

  revalidateAfterAssetMutation(input.id)
})

export const softDeleteAsset = action(async (assetId: string): Promise<void> => {
  const { group } = await requireViewerGroup()

  const updated = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(assets.id, assetId),
      eq(assets.groupId, group.id),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw actionError('aibutsu_not_found')

  revalidateAfterAssetMutation(assetId, { affectsRecords: true })
})

export interface PickerAsset {
  id: string
  type: AssetType
  name: string
}

export interface CarAsset {
  id: string
  name: string
}

/**
 * Returns all non-deleted car assets for the viewer's group.
 * Used by the insurance form vehicle picker.
 */
export const getCarAssets = action(async (): Promise<CarAsset[]> => {
  const { group } = await requireViewerGroup()
  const rows = await listAssetsForGroup(group.id)
  return rows
    .filter(r => r.type === 'car')
    .map(r => ({ id: r.id, name: r.name }))
})

export interface ChildAsset {
  id: string
  name: string
}

/**
 * #167 — Non-deleted child assets for the viewer's group, used by the
 * insurance form to bind 被保人 to a Child 愛物 (insured_child_id).
 */
export const getChildAssets = action(async (): Promise<ChildAsset[]> => {
  const { group } = await requireViewerGroup()
  const rows = await listAssetsForGroup(group.id)
  return rows
    .filter(r => r.type === 'child')
    .map(r => ({ id: r.id, name: r.name }))
})

/**
 * Lightweight asset list for AssetPickerSheet — name + plate only, excludes
 * deleted assets (new transaction links can never point at zombies).
 */
export const loadAssetsForPicker = action(async (): Promise<PickerAsset[]> => {
  const { group } = await requireViewerGroup()
  const rows = await listAssetsForGroup(group.id)
  return rows.map(r => ({ id: r.id, type: r.type, name: r.name }))
})

export interface LoadedAsset {
  id: string
  name: string
  deletedAt: string | null  // ISO
}

/**
 * Loads a single asset for display (e.g. AddSheet's "關聯資產" row showing
 * "我的 Tesla（已刪除）"). Returns null if not found or wrong group.
 */
export const loadAsset = action(async (assetId: string): Promise<LoadedAsset | null> => {
  const { group } = await requireViewerGroup()
  const row = await getAssetById(assetId, group.id)
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
})

// ── Child ──────────────────────────────────────────────────────────────────

export interface CreateChildInput {
  /** Display nickname (e.g. 「小白」). Stored plaintext on `Assets.name`. */
  name: string
  nickname?: string | null
  gender?: 'male' | 'female' | 'other' | null
  birthday?: string | null
  nationalId?: string | null
  nhiNo?: string | null
  /** #826 — encrypted full name (e.g. 「陳小白」). Trinary semantics same
   *  as nationalId / nhiNo. Optional; pre-rollout child rows have no
   *  encrypted full name and the reveal row hides itself. */
  fullName?: string | null
  bloodType?: string | null
  hospital?: string | null
  heightCm?: number | null
  weightG?: number | null
  notes?: string | null
}

export interface EditChildInput extends CreateChildInput {
  id: string
}

/**
 * Encrypt a PII trinary value for INSERT.
 *
 * `validateChildInput` returns `undefined` (no change) | `null` (clear) |
 * `string` (set). On INSERT there is no existing row to keep — both `undefined`
 * and `null` map to NULL in the column; only a non-empty string is encrypted.
 */
function encryptForInsert(value: string | null | undefined, ctx: AadContext): string | null {
  if (value === undefined || value === null) return null
  return encrypt(value, ctx)
}

export const createChild = action(async (input: CreateChildInput): Promise<{ id: string }> => {
  'use server'
  const validated = validateChildInput(input)
  const { user, group } = await requireViewerGroup()

  // #1287 — Assets.id is generated here (not by the DB default) so the
  // name_encrypted AAD can bind to the row's primary key before the INSERT.
  // The same value goes to `.values({ id })` and to aadFor.
  const assetId = randomUUID()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({
        id: assetId,
        groupId: group.id,
        type: 'child',
        name: validated.name,
        // #826 — encrypted full name on the Asset row. Display name stays on
        // `name` (plaintext) so list / header / sibling-rail queries don't
        // need to decrypt for casual reads.
        nameEncrypted: encryptForInsert(validated.fullName, aadFor('Assets', 'name_encrypted', assetId)),
        notes: validated.notes,
      })
      .returning({ id: assets.id })
    await tx.insert(childDetails).values({
      assetId: asset.id,
      birthday: validated.birthday,
      gender: validated.gender,
      idNumberEncrypted: encryptForInsert(validated.nationalId, aadFor('ChildDetails', 'id_number_encrypted', asset.id)),
      insuranceIdEncrypted: encryptForInsert(validated.nhiNo, aadFor('ChildDetails', 'insurance_id_encrypted', asset.id)),
      nickname: validated.nickname,
      hospital: validated.hospital,
      bloodType: validated.bloodType,
      heightCm: validated.heightCm,
      weightG: validated.weightG,
    })
    return [asset]
  })

  revalidateAfterAssetMutation()
  await captureServer(user.id, 'asset_created', { asset_type: 'child' })
  return { id: created.id }
})

export const editChild = action(async (input: EditChildInput): Promise<void> => {
  'use server'
  const validated = validateChildInput(input)
  const { group } = await requireViewerGroup()

  // Trinary PII handling: build the partial column updates lazily so a
  // "no change" (undefined) input doesn't touch the encrypted column. Only
  // explicit clear (null) or set (string) writes the column.
  //
  // Why this matters: AssetSheet now starts these fields empty (we never
  // hand plaintext to the client), so an unedited form produces undefined.
  // If we coerced undefined → null we'd silently wipe everyone's existing
  // PII the first time anyone edited any unrelated field.
  const piiUpdates: {
    idNumberEncrypted?: string | null
    insuranceIdEncrypted?: string | null
  } = {}
  if (validated.nationalId !== undefined) {
    piiUpdates.idNumberEncrypted = validated.nationalId === null ? null : encrypt(validated.nationalId, aadFor('ChildDetails', 'id_number_encrypted', input.id))
  }
  if (validated.nhiNo !== undefined) {
    piiUpdates.insuranceIdEncrypted = validated.nhiNo === null ? null : encrypt(validated.nhiNo, aadFor('ChildDetails', 'insurance_id_encrypted', input.id))
  }
  // #826 — full name lives on the Assets row (not childDetails). Same trinary
  // semantics: undefined leaves the column untouched, null clears it, string
  // encrypts and sets.
  const assetUpdates: { name: string; notes: string | null; nameEncrypted?: string | null } = {
    name: validated.name,
    notes: validated.notes,
  }
  if (validated.fullName !== undefined) {
    assetUpdates.nameEncrypted = validated.fullName === null ? null : encrypt(validated.fullName, aadFor('Assets', 'name_encrypted', input.id))
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set(assetUpdates)
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'child'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw actionError('aibutsu_not_found')
    // #1287 — the ciphertexts above were bound to `input.id`. Postgres matches
    // uuid literals case-insensitively (and accepts brace / no-hyphen forms),
    // so a non-canonical id would find the row yet bind an AAD the reveal
    // (canonical id) can never reproduce. Refuse it; throwing rolls back.
    if (updated[0].id !== input.id) throw actionError('aibutsu_not_found')

    // INSERT path runs only when no row exists yet — same encryption rules as
    // createChild (undefined / null → NULL column; string → encrypted).
    await tx
      .insert(childDetails)
      .values({
        assetId: input.id,
        birthday: validated.birthday,
        gender: validated.gender,
        idNumberEncrypted: encryptForInsert(validated.nationalId, aadFor('ChildDetails', 'id_number_encrypted', input.id)),
        insuranceIdEncrypted: encryptForInsert(validated.nhiNo, aadFor('ChildDetails', 'insurance_id_encrypted', input.id)),
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
          ...piiUpdates,
          nickname: validated.nickname,
          hospital: validated.hospital,
          bloodType: validated.bloodType,
          heightCm: validated.heightCm,
          weightG: validated.weightG,
        },
      })
  })

  revalidateAfterAssetMutation(input.id)
})

/**
 * On-demand decryption for child PII fields. The detail page never receives
 * plaintext; instead it calls this server action when the user taps "顯示" on a
 * masked row. Authorisation is double-gated (group ownership + asset.type) so
 * a malicious client can't lift PII from another household by guessing UUIDs.
 *
 * Returns the plaintext value. Throws on cross-group access, wrong asset
 * type, soft-deleted asset, or null column (nothing stored).
 */
export const revealChildPii = action(async (
  assetId: string,
  field: 'nationalId' | 'nhiNo',
): Promise<string> => {
  'use server'
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      assetType: assets.type,
      assetDeletedAt: assets.deletedAt,
      idNumberEncrypted: childDetails.idNumberEncrypted,
      insuranceIdEncrypted: childDetails.insuranceIdEncrypted,
    })
    .from(assets)
    .leftJoin(childDetails, eq(childDetails.assetId, assets.id))
    .where(and(eq(assets.id, assetId), eq(assets.groupId, group.id)))
    .limit(1)
  if (!row || row.assetDeletedAt || row.assetType !== 'child') {
    throw actionError('aibutsu_not_found')
  }

  const ciphertext = field === 'nationalId' ? row.idNumberEncrypted : row.insuranceIdEncrypted
  if (!ciphertext) throw actionError('field_not_filled')

  return decrypt(
    ciphertext,
    field === 'nationalId'
      ? aadFor('ChildDetails', 'id_number_encrypted', assetId)
      : aadFor('ChildDetails', 'insurance_id_encrypted', assetId),
  )
})

/**
 * #826 — on-demand decryption for the child's encrypted full name. The
 * display name (`Assets.name`) is the nickname rendered everywhere; this
 * action returns the encrypted real full name on tap. Throws if no
 * encrypted value is stored — pre-rollout child rows have only the
 * legacy plaintext `name` column populated, and the detail page hides
 * the reveal row in that case.
 */
export const revealChildName = action(async (assetId: string): Promise<string> => {
  'use server'
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      assetType: assets.type,
      assetDeletedAt: assets.deletedAt,
      nameEncrypted: assets.nameEncrypted,
    })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.groupId, group.id)))
    .limit(1)
  if (!row || row.assetDeletedAt || row.assetType !== 'child') {
    throw actionError('aibutsu_not_found')
  }
  if (!row.nameEncrypted) throw actionError('field_not_filled')
  return decrypt(row.nameEncrypted, aadFor('Assets', 'name_encrypted', assetId))
})

/**
 * #826 — on-demand decryption for the car licence plate. Same authorisation
 * shape as `revealChildPii`: scoped to viewer's group, gated by asset.type,
 * refuses soft-deleted rows. The backfill (`scripts/encrypt-existing-pii.mjs`)
 * has populated `plate_encrypted` on every environment, so the encrypted
 * column is the single source of truth — no legacy-plaintext fallback.
 */
export const revealCarPlate = action(async (assetId: string): Promise<string> => {
  'use server'
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      assetType: assets.type,
      assetDeletedAt: assets.deletedAt,
      plateEncrypted: carDetails.plateEncrypted,
    })
    .from(assets)
    .leftJoin(carDetails, eq(carDetails.assetId, assets.id))
    .where(and(eq(assets.id, assetId), eq(assets.groupId, group.id)))
    .limit(1)
  if (!row || row.assetDeletedAt || row.assetType !== 'car') {
    throw actionError('aibutsu_not_found')
  }

  if (!row.plateEncrypted) throw actionError('field_not_filled')
  return decrypt(row.plateEncrypted, aadFor('CarDetails', 'plate_encrypted', assetId))
})

/**
 * #826 — on-demand decryption for the house address. Address is nullable
 * (some houses don't have one recorded), so the encrypted column may be NULL.
 * Like `revealCarPlate`, reads only the encrypted column post-backfill.
 */
export const revealHouseAddress = action(async (assetId: string): Promise<string> => {
  'use server'
  const { group } = await requireViewerGroup()

  const [row] = await db
    .select({
      assetType: assets.type,
      assetDeletedAt: assets.deletedAt,
      addressEncrypted: houseDetails.addressEncrypted,
    })
    .from(assets)
    .leftJoin(houseDetails, eq(houseDetails.assetId, assets.id))
    .where(and(eq(assets.id, assetId), eq(assets.groupId, group.id)))
    .limit(1)
  if (!row || row.assetDeletedAt || row.assetType !== 'house') {
    throw actionError('aibutsu_not_found')
  }

  if (!row.addressEncrypted) throw actionError('field_not_filled')
  return decrypt(row.addressEncrypted, aadFor('HouseDetails', 'address_encrypted', assetId))
})

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
  notes?: string | null
}

export interface EditPetInput extends CreatePetInput {
  id: string
}

export const createPet = action(async (input: CreatePetInput): Promise<{ id: string }> => {
  'use server'
  const validated = validatePetInput(input)
  const { user, group } = await requireViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'pet', name: validated.name, notes: validated.notes })
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

  revalidateAfterAssetMutation()
  await captureServer(user.id, 'asset_created', { asset_type: 'pet' })
  return { id: created.id }
})

export const editPet = action(async (input: EditPetInput): Promise<void> => {
  'use server'
  const validated = validatePetInput(input)
  const { group } = await requireViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name, notes: validated.notes })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'pet'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw actionError('aibutsu_not_found')

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

  revalidateAfterAssetMutation(input.id)
})

// ── Plant ──────────────────────────────────────────────────────────────────

export interface CreatePlantInput {
  name: string
  species?: string | null
  location?: string | null
  sproutedAt?: string | null
  cost?: number | null
  waterEvery?: number | null
  notes?: string | null
}

export interface EditPlantInput extends CreatePlantInput {
  id: string
}

export const createPlant = action(async (input: CreatePlantInput): Promise<{ id: string }> => {
  'use server'
  const validated = validatePlantInput(input)
  const { user, group } = await requireViewerGroup()

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'plant', name: validated.name, notes: validated.notes })
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

  revalidateAfterAssetMutation()
  await captureServer(user.id, 'asset_created', { asset_type: 'plant' })
  return { id: created.id }
})

export const editPlant = action(async (input: EditPlantInput): Promise<void> => {
  'use server'
  const validated = validatePlantInput(input)
  const { group } = await requireViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name, notes: validated.notes })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'plant'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw actionError('aibutsu_not_found')

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

  revalidateAfterAssetMutation(input.id)
})

// ── Insurance ──────────────────────────────────────────────────────────────

export interface CreateInsuranceInput {
  name: string
  kind?: string | null
  insured?: string | null
  insuredChildId?: string | null
  insuredUserId?: string | null
  policyHolderUserId?: string | null
  insurer?: string | null
  policyNo?: string | null
  annualPremium?: number | null
  sumInsured?: number | null
  payCycle?: string | null
  startsAt?: string | null
  endsAt?: string | null
  termYears?: number | null
  vehicleId?: string | null
  expectedMaturityAmount?: number | null
  accountValue?: number | null
  reminderDaysBefore?: number | null
  notes?: string | null
}

export interface EditInsuranceInput extends CreateInsuranceInput {
  id: string
}

/**
 * #167 — verifies that `insured_child_id` points at a non-deleted Child 愛物
 * belonging to the viewer's group. Mirrors the vehicleId guard pattern.
 */
async function assertInsuredChildInGroup(childId: string, groupId: string): Promise<void> {
  const [child] = await db
    .select({ id: assets.id, type: assets.type, deletedAt: assets.deletedAt })
    .from(assets)
    .where(and(eq(assets.id, childId), eq(assets.groupId, groupId)))
    .limit(1)
  if (!child || child.type !== 'child' || child.deletedAt) {
    throw actionError('insured_child_invalid')
  }
}

/**
 * #167 + #237 — collapse the three insured-source inputs into the canonical
 * shape stored in `insuranceDetails`. Precedence: child > member > text. The
 * losers are nulled so only one source of truth lives on disk; `insuredType`
 * stays 'user' whenever the source is a member FK or freeform text.
 */
function resolveInsuredFields(v: {
  insuredChildId: string | null
  insuredUserId: string | null
  insured: string | null
}): {
  type: 'child' | 'user'
  childId: string | null
  userId: string | null
  text: string | null
} {
  if (v.insuredChildId) {
    return { type: 'child', childId: v.insuredChildId, userId: null, text: null }
  }
  if (v.insuredUserId) {
    return { type: 'user', childId: null, userId: v.insuredUserId, text: null }
  }
  return { type: 'user', childId: null, userId: null, text: v.insured }
}

export const createInsurance = action(async (input: CreateInsuranceInput): Promise<{ id: string }> => {
  'use server'
  const validated = validateInsuranceInput(input)
  const { user, group } = await requireViewerGroup()

  // #221 — server-side safety net: never let an insurance asset be created
  // when the Guardian beta is off, even if the client surface somehow bypasses
  // the TypePicker gate.
  if (!canAccessGuardian(group)) {
    throw new Error('guardian_disabled')
  }

  if (input.vehicleId) {
    const [vehicle] = await db
      .select({ id: assets.id, type: assets.type, deletedAt: assets.deletedAt })
      .from(assets)
      .where(and(eq(assets.id, input.vehicleId), eq(assets.groupId, group.id)))
      .limit(1)
    if (!vehicle || vehicle.type !== 'car' || vehicle.deletedAt) {
      throw actionError('linked_vehicle_invalid')
    }
  }

  if (validated.policyHolderUserId) {
    assertPolicyHolderInGroup(validated.policyHolderUserId, group)
  }

  if (validated.insuredChildId) {
    await assertInsuredChildInGroup(validated.insuredChildId, group.id)
  }
  if (validated.insuredUserId) {
    assertInsuredUserInGroup(validated.insuredUserId, group)
  }

  // #167 + #237 — `insured_type` discriminates between Child 愛物 (FK to
  // assets) and a "user" (group member FK to profiles, or freeform text).
  // The three sources are mutually exclusive — child > member > text — and
  // the losers are nulled so the DB only ever carries one source of truth.
  const insured = resolveInsuredFields(validated)

  const [created] = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'insurance', name: validated.name, notes: validated.notes })
      .returning({ id: assets.id })
    await tx.insert(insuranceDetails).values({
      assetId: asset.id,
      insuranceType: validated.kind,
      insured: insured.text,
      insuredChildId: insured.childId,
      insuredUserId: insured.userId,
      policyHolderUserId: validated.policyHolderUserId,
      insurer: validated.insurer,
      policyNumber: validated.policyNo,
      annualPremium: validated.annualPremium,
      sumInsured: validated.sumInsured,
      payCycle: validated.payCycle,
      startsAt: validated.startsAt,
      expiryDate: validated.endsAt,
      termYears: validated.termYears,
      insuredType: insured.type,
      vehicleId: validated.vehicleId,
      expectedMaturityAmount: validated.expectedMaturityAmount,
      accountValue: validated.accountValue,
      reminderDaysBefore: validated.reminderDaysBefore,
    })
    return [asset]
  })

  revalidateAfterAssetMutation()
  await captureServer(user.id, 'asset_created', { asset_type: 'insurance' })
  return { id: created.id }
})

export const editInsurance = action(async (input: EditInsuranceInput): Promise<void> => {
  'use server'
  const validated = validateInsuranceInput(input)
  const { group } = await requireViewerGroup()

  if (input.vehicleId) {
    const [vehicle] = await db
      .select({ id: assets.id, type: assets.type, deletedAt: assets.deletedAt })
      .from(assets)
      .where(and(eq(assets.id, input.vehicleId), eq(assets.groupId, group.id)))
      .limit(1)
    if (!vehicle || vehicle.type !== 'car' || vehicle.deletedAt) {
      throw actionError('linked_vehicle_invalid')
    }
  }

  if (validated.policyHolderUserId) {
    assertPolicyHolderInGroup(validated.policyHolderUserId, group)
  }

  if (validated.insuredChildId) {
    await assertInsuredChildInGroup(validated.insuredChildId, group.id)
  }
  if (validated.insuredUserId) {
    assertInsuredUserInGroup(validated.insuredUserId, group)
  }

  const insured = resolveInsuredFields(validated)

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name, notes: validated.notes })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'insurance'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw actionError('aibutsu_not_found')

    await tx
      .insert(insuranceDetails)
      .values({
        assetId: input.id,
        insuranceType: validated.kind,
        insured: insured.text,
        insuredChildId: insured.childId,
        insuredUserId: insured.userId,
        policyHolderUserId: validated.policyHolderUserId,
        insurer: validated.insurer,
        policyNumber: validated.policyNo,
        annualPremium: validated.annualPremium,
        sumInsured: validated.sumInsured,
        payCycle: validated.payCycle,
        startsAt: validated.startsAt,
        expiryDate: validated.endsAt,
        termYears: validated.termYears,
        insuredType: insured.type,
        vehicleId: validated.vehicleId,
        expectedMaturityAmount: validated.expectedMaturityAmount,
        accountValue: validated.accountValue,
        reminderDaysBefore: validated.reminderDaysBefore,
      })
      .onConflictDoUpdate({
        target: insuranceDetails.assetId,
        set: {
          insuranceType: validated.kind,
          insured: insured.text,
          insuredChildId: insured.childId,
          insuredUserId: insured.userId,
          insuredType: insured.type,
          policyHolderUserId: validated.policyHolderUserId,
          insurer: validated.insurer,
          policyNumber: validated.policyNo,
          annualPremium: validated.annualPremium,
          sumInsured: validated.sumInsured,
          payCycle: validated.payCycle,
          startsAt: validated.startsAt,
          expiryDate: validated.endsAt,
          termYears: validated.termYears,
          vehicleId: validated.vehicleId,
          expectedMaturityAmount: validated.expectedMaturityAmount,
          accountValue: validated.accountValue,
          reminderDaysBefore: validated.reminderDaysBefore,
        },
      })
  })

  revalidateAfterAssetMutation(input.id)
})

/**
 * v0.15.0 #127 — Renew a single-year insurance policy.
 *
 * Extends the policy's expiry_date by exactly one year and optionally rotates
 * the policy number (renewal typically issues a fresh number). The starts_at
 * date is kept as-is so the original on-cover date stays intact in history.
 *
 * Only meaningful for term_years = 1 policies but the action does not enforce
 * that — multi-year policies could also use it for an off-spec extension.
 */
export const renewInsurance = action(async (input: {
  id: string
  newPolicyNumber?: string | null
}): Promise<void> => {
  'use server'
  const { group } = await requireViewerGroup()

  const [asset] = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(
      eq(assets.id, input.id),
      eq(assets.groupId, group.id),
      eq(assets.type, 'insurance'),
      isNull(assets.deletedAt),
    ))
    .limit(1)
  if (!asset) throw actionError('policy_not_found')

  const [details] = await db
    .select({ expiryDate: insuranceDetails.expiryDate })
    .from(insuranceDetails)
    .where(eq(insuranceDetails.assetId, input.id))
    .limit(1)
  if (!details?.expiryDate) throw actionError('policy_expiry_unset')

  const next = new Date(`${details.expiryDate}T00:00:00`)
  next.setFullYear(next.getFullYear() + 1)
  const nextExpiry = next.toISOString().slice(0, 10)

  const trimmedPolicyNo = input.newPolicyNumber?.trim()
  const setClause: { expiryDate: string; policyNumber?: string } = { expiryDate: nextExpiry }
  if (trimmedPolicyNo) setClause.policyNumber = trimmedPolicyNo

  await db
    .update(insuranceDetails)
    .set(setClause)
    .where(eq(insuranceDetails.assetId, input.id))

  revalidateAfterAssetMutation(input.id)
})

/**
 * v0.15.0 #127 — Mark an insurance policy as lapsed/stopped.
 *
 * Uses the existing soft-delete column on assets so the policy disappears from
 * the list but the row is retained for history. Mirrors softDeleteAsset semantics
 * (1-year pg_cron purge), scoped through the insurance type check so callers
 * can't accidentally lapse a non-insurance asset through this action.
 */
export const lapseInsurance = action(async (input: { id: string }): Promise<void> => {
  'use server'
  const { group } = await requireViewerGroup()

  const result = await db
    .update(assets)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(assets.id, input.id),
      eq(assets.groupId, group.id),
      eq(assets.type, 'insurance'),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (result.length === 0) throw actionError('policy_not_found')

  revalidateAfterAssetMutation(input.id)
})

// ── House ──────────────────────────────────────────────────────────────────

export interface CreateHouseInput {
  name: string
  address?: string | null
  purchasedAt?: string | null
  purchasePrice?: number | null
  notes?: string | null
}

export const createHouse = action(async (input: CreateHouseInput): Promise<{ id: string }> => {
  'use server'
  const validated = validateHouseInput(input)
  // Same write gate as createCar: the purchase price records a CashTransaction.
  const { user: viewer, group } = await getViewerWriteContext()

  const { created, firstRecord } = await db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(assets)
      .values({ groupId: group.id, type: 'house', name: validated.name, notes: validated.notes })
      .returning({ id: assets.id })
    await tx.insert(houseDetails).values({
      assetId: asset.id,
      owner: viewer.id,
      // #837 — address stored encrypted only (legacy `address` dropped).
      // Nullable: undefined/null/blank → NULL, a value → encrypted.
      addressEncrypted: encryptForInsert(validated.address, aadFor('HouseDetails', 'address_encrypted', asset.id)),
      purchasedAt: validated.purchasedAt,
      purchasePrice: validated.purchasePrice,
    })

    let firstRecord = false
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
      firstRecord = await isUserFirstNonDeletedRecord(tx, viewer.id, group.id)
    }

    return { created: asset, firstRecord }
  })

  revalidateAfterAssetMutation(null, { affectsRecords: true, affectsDashboard: true })
  if (firstRecord) {
    await captureServer(viewer.id, 'first_record_created', { via: 'asset_purchase' })
  }
  await captureServer(viewer.id, 'asset_created', { asset_type: 'house' })
  return { id: created.id }
})

export interface EditHouseInput {
  id: string
  name: string
  address?: string | null
  purchasedAt?: string | null
  purchasePrice?: number | null
  notes?: string | null
}

export const editHouse = action(async (input: EditHouseInput): Promise<void> => {
  'use server'
  const validated = validateHouseInput(input)
  const { group } = await requireViewerGroup()

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(assets)
      .set({ name: validated.name, notes: validated.notes })
      .where(and(
        eq(assets.id, input.id),
        eq(assets.groupId, group.id),
        eq(assets.type, 'house'),
        isNull(assets.deletedAt),
      ))
      .returning({ id: assets.id })
    if (updated.length === 0) throw actionError('aibutsu_not_found')

    // #837 — address trinary: only touch address_encrypted when the form
    // supplied a value (string = encrypt+set, null = clear). undefined leaves
    // it intact (form starts blank; an unedited field must not wipe it).
    const houseUpdates: {
      purchasedAt: string | null
      purchasePrice: number | null
      addressEncrypted?: string | null
    } = {
      purchasedAt: validated.purchasedAt,
      purchasePrice: validated.purchasePrice,
    }
    if (validated.address !== undefined) {
      houseUpdates.addressEncrypted = validated.address === null ? null : encrypt(validated.address, aadFor('HouseDetails', 'address_encrypted', updated[0].id))
    }

    await tx
      .update(houseDetails)
      .set(houseUpdates)
      .where(eq(houseDetails.assetId, input.id))
  })

  revalidateAfterAssetMutation(input.id)
})

// ── Template-based assets (#222) ──────────────────────────────────────────────

export interface CreateTemplateAssetInput {
  templateKey: AssetTemplateKey
  name: string
  notes?: string | null
  fields: Record<string, unknown>
}

/**
 * Creates a template-based asset. Always lands on type='item' so legacy
 * queries that filter by `type` (car / house / insurance / etc.) keep their
 * existing semantics; this is the contract that lets old + new coexist.
 *
 * `fields` is validated against the template's declared schema in
 * lib/assetTemplates.ts. Unknown keys are dropped; type errors throw.
 *
 * NOT to be confused with the legacy create paths (createCar / createInsurance
 * / etc.) — those write to the matching *Details subtable and participate in
 * FuelLog / SavingsView / insurance cron. Template-based assets do not.
 */
export const createTemplateAsset = action(async (input: CreateTemplateAssetInput): Promise<{ id: string }> => {
  if (!isAssetTemplateKey(input.templateKey)) {
    throw actionError('template_unknown')
  }
  const name = validateName(input.name, '名稱')
  const notes = validateNotes(input.notes)
  const fields = validateTemplateFields(input.templateKey, input.fields)
  const { user, group } = await requireViewerGroup()

  const [created] = await db
    .insert(assets)
    .values({
      groupId: group.id,
      type: 'item',
      name,
      notes,
      templateKey: input.templateKey,
      templateFields: fields,
    })
    .returning({ id: assets.id })

  revalidateAfterAssetMutation()
  await captureServer(user.id, 'asset_created', { asset_type: 'item' })
  return { id: created.id }
})

export interface EditTemplateAssetInput extends CreateTemplateAssetInput {
  id: string
}

/**
 * Updates a template-based asset in place. The template can change between
 * the four options (e.g. 一般 → 車輛) — when it does, validation runs against
 * the new template's schema, so stale fields from the old template are
 * silently dropped.
 *
 * Refuses to operate on legacy assets (template_key IS NULL) — those still go
 * through the existing editCar / editChild / etc. paths.
 */
export const editTemplateAsset = action(async (input: EditTemplateAssetInput): Promise<void> => {
  if (!isAssetTemplateKey(input.templateKey)) {
    throw actionError('template_unknown')
  }
  const name = validateName(input.name, '名稱')
  const notes = validateNotes(input.notes)
  const fields = validateTemplateFields(input.templateKey, input.fields)
  const { group } = await requireViewerGroup()

  const updated = await db
    .update(assets)
    .set({
      name,
      notes,
      templateKey: input.templateKey,
      templateFields: fields,
    })
    .where(and(
      eq(assets.id, input.id),
      eq(assets.groupId, group.id),
      eq(assets.type, 'item'),
      isNull(assets.deletedAt),
    ))
    .returning({ id: assets.id })
  if (updated.length === 0) throw actionError('aibutsu_not_found')

  revalidateAfterAssetMutation(input.id)
})
