/**
 * Insurance kind classification (savings / protection / car) for framing the
 * detail page. `kind` is the free-form text in InsuranceDetails.insurance_type.
 *
 * v0.8.0 only ships SavingsView; protection / car fall through to the legacy
 * detail layout.
 *
 * Display labels for kind / payCycle live in i18n dictionaries (assetDetail.insurance.kindLabels
 * / payCycleLabels) — see InsuranceDetailClientLegacy & SavingsView for inline lookup helpers.
 */

export type FramingGroup = 'savings' | 'protection' | 'car'

export function getFramingGroup(kind: string | null | undefined): FramingGroup {
  if (kind === 'savings') return 'savings'
  if (kind === 'car') return 'car'
  return 'protection'
}
