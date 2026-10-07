import type { AssetTemplateKey } from '@/lib/assetTemplates'
import type { AssetType } from '@/lib/assets'
import type { GasFuelType } from '@/lib/fuel'

export interface AssetSheetInitial {
  id: string
  type: AssetType
  name: string
  // #222 — template path. When set, this asset is template-based and AssetSheet
  // routes to TemplateSheetBody regardless of `type`. `type` for these is
  // always 'item' — `templateKey` is what drives the visible fields.
  templateKey?: AssetTemplateKey | null
  templateFields?: Record<string, string | number | null> | null
  // car-only fields
  /** #837 — plate is encrypted at rest; the form never receives plaintext.
   *  This bool only drives the 「先前已加密」 placeholder + 「清除」 button,
   *  same UX as childHasNationalId. */
  carHasPlate?: boolean
  purchasedAt?: string | null
  purchasePrice?: number | null
  fuelType?: GasFuelType
  primaryUserId?: string | null
  /** #1589 — the stored 主要使用人 left the ledger. The id is not sent
   *  (primaryUserId is null, which here does NOT mean 共用); the sheet starts
   *  with nothing selected and, unless a person is picked, saves with
   *  primaryUserId undefined so editCar keeps the stored value. */
  primaryUserFormer?: boolean
  // extended car fields
  color?: string | null
  year?: number | null
  brand?: string | null
  model?: string | null
  initialOdometer?: number | null
  // Child-specific. nationalId / nhiNo are encrypted at rest (see
  // actions/asset.ts createChild/editChild/revealChildPii); the form never
  // receives plaintext, only the has-value bools so it can show 「清除」.
  childNickname?: string | null
  childGender?: 'male' | 'female' | 'other' | null
  childBirthday?: string | null
  childHasNationalId?: boolean
  childHasNhiNo?: boolean
  /** #826 — Assets.name_encrypted IS NOT NULL on the server. The form never
   *  receives the decrypted full name; this bool just lets the input show
   *  「先前已加密」 placeholder + 「清除」 button, same UX as nationalId. */
  childHasFullName?: boolean
  childBloodType?: string | null
  childHospital?: string | null
  childHeightCm?: number | null
  childWeightG?: number | null
  // Pet-specific
  petSpecies?: string | null
  petBreed?: string | null
  petSex?: string | null
  petBirthDate?: string | null
  petAdoptedDate?: string | null
  petPurchaseCost?: number | null
  petWeightG?: number | null
  petChipNo?: string | null
  petVet?: string | null
  // Plant-specific
  plantSpecies?: string | null
  plantLocation?: string | null
  plantSproutedAt?: string | null
  plantCost?: number | null
  plantWaterEvery?: number | null
  // Insurance-specific
  insKind?: string | null
  insInsured?: string | null
  insInsuredChildId?: string | null
  insInsuredUserId?: string | null
  insPolicyHolderUserId?: string | null
  /** #1579 — the stored 要保人 / member 被保人 left the ledger. The id is not
   *  sent (insPolicyHolderUserId / insInsuredUserId are null); the sheet starts
   *  with nothing selected and cannot save until a current person is picked. */
  insPolicyHolderFormer?: boolean
  insInsuredFormer?: boolean
  insInsurer?: string | null
  insPolicyNo?: string | null
  insAnnualPremium?: number | null
  insSumInsured?: number | null
  insPayCycle?: string | null
  insStartsAt?: string | null
  insEndsAt?: string | null
  insTermYears?: number | null
  insVehicleId?: string | null
  insExpectedMaturityAmount?: number | null
  // #166 — current account value for investment-linked savings policies.
  // Only persisted when kind === 'savings'.
  insAccountValue?: number | null
  // House-specific
  /** #837 — address is encrypted at rest; the form never receives plaintext.
   *  Bool drives the 「先前已加密」 placeholder + 「清除」 button. */
  houseHasAddress?: boolean
  housePurchasedAt?: string | null
  housePurchasePrice?: number | null
  // Shared across all six asset types — freeform user notes
  notes?: string | null
}

// Type picker covers all 6 legacy types plus the new template-based 'item'
// (#222). Selecting 'item' routes to TemplateSheetBody; the other six route
// to their dedicated *SheetBody. Aliased to AssetType since both cover every
// type — keeping the alias so the picker's intent stays readable at call sites.
export type PickerType = AssetType

export interface BodySharedProps {
  open: boolean
  onClose: () => void
  onMutated?: (kind: 'saved' | 'deleted') => void
  typePickerSlot?: React.ReactNode
}
