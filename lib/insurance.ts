/**
 * Insurance kind classification (savings / protection / car) for framing the
 * detail page. `kind` is the free-form text in InsuranceDetails.insurance_type.
 *
 * v0.8.0 only ships SavingsView; protection / car fall through to the legacy
 * detail layout.
 */

export type FramingGroup = 'savings' | 'protection' | 'car'

export const INSURANCE_KIND_LABELS: Record<string, string> = {
  medical: '醫療',
  life: '壽險',
  accident: '意外',
  cancer: '癌症',
  illness: '重大傷病',
  car: '汽車',
  savings: '儲蓄',
}

export const PAY_CYCLE_LABELS: Record<string, string> = {
  annual: '年繳',
  semi: '半年繳',
  quarterly: '季繳',
  monthly: '月繳',
}

export function getFramingGroup(kind: string | null | undefined): FramingGroup {
  if (kind === 'savings') return 'savings'
  if (kind === 'car') return 'car'
  return 'protection'
}

export function getKindLabel(kind: string | null | undefined): string {
  if (!kind) return ''
  return INSURANCE_KIND_LABELS[kind] ?? kind
}

export function getPayCycleLabel(cycle: string | null | undefined): string {
  if (!cycle) return ''
  return PAY_CYCLE_LABELS[cycle] ?? cycle
}
