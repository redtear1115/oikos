// #1579 — editing a policy whose 要保人 / member 被保人 left the ledger.
//
// The page sends no id for that person, only `insPolicyHolderFormer` /
// `insInsuredFormer`. The sheet must start with nothing selected (not the
// legacy viewer default, which would silently hand the policy to the viewer),
// show a hint, and keep save disabled until a current person is picked.
//
// Failure looks like: the sheet opens with 我 preselected and saving a premium
// change quietly makes the viewer the policy holder; or 自行輸入 looks selected
// with an empty box, and save writes the insured as blank.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import type { InsuranceInitial } from '@/app/(dashboard)/assets/_components/AssetSheet/InsuranceSheetBody'

const VIEWER = { id: 'a0a0a0a0-0000-4000-8000-0000000000a0', displayName: 'Me' }
const PARTNER = { id: 'd0d0d0d0-0000-4000-8000-0000000000d0', displayName: 'Dana' }
let partner: typeof PARTNER | null = PARTNER

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/assets',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useBaseCurrency: () => 'twd' as const,
  useMember: () => ({ viewer: VIEWER, partner, isPast: false, canAccessGuardian: true }),
}))
const editInsurance = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, data: undefined }))
vi.mock('@/actions/asset', () => ({
  createInsurance: vi.fn(),
  editInsurance: (...args: unknown[]) => editInsurance(...args),
  getCarAssets: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  getChildAssets: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  softDeleteAsset: vi.fn(),
}))

import { InsuranceSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/InsuranceSheetBody'

const ts = zhTW.assetSheet.insurance
const ME_LABEL = zhTW.common.me

function Wrapper({ children }: { children: ReactNode }) {
  return <TranslationsProvider value={zhTW} locale="zh-TW">{children}</TranslationsProvider>
}

const base: InsuranceInitial = {
  id: 'ins-1', name: '儲蓄險', notes: null, insKind: 'savings', insInsured: null, insInsuredChildId: null,
  insInsuredUserId: null, insPolicyHolderUserId: null, insInsurer: 'Acme', insPolicyNo: null,
  insAnnualPremium: 12000, insSumInsured: null, insPayCycle: 'annual', insStartsAt: null, insEndsAt: null,
  insTermYears: null, insVehicleId: null, insExpectedMaturityAmount: null, insAccountValue: null,
}

const saveButton = () => screen.getByRole('button', { name: zhTW.assetSheet.saveChanges })
/** Segment (要保人) active state and chip (被保人) selected state, as styled. */
const segmentActive = (el: HTMLElement) => (el.getAttribute('style') ?? '').includes('var(--toggle-segment-thumb)')
const chipSelected = (el: HTMLElement) => (el.getAttribute('style') ?? '').includes('1.5px solid')

beforeEach(() => {
  partner = PARTNER
  editInsurance.mockClear()
})

describe('InsuranceSheetBody — former 要保人 and 被保人 (#1579)', () => {
  it('both former: two hints, nothing selected (freeform not selected), save disabled', () => {
    render(
      <InsuranceSheetBody open onClose={() => {}} initial={{ ...base, insPolicyHolderFormer: true, insInsuredFormer: true }} />,
      { wrapper: Wrapper },
    )
    expect(screen.getByText(ts.policyHolderFormerHint)).toBeInTheDocument()
    expect(screen.getByText(ts.insuredFormerHint)).toBeInTheDocument()

    const [holderMe, insuredMe] = screen.getAllByRole('button', { name: ME_LABEL })
    const [holderPartner, insuredPartner] = screen.getAllByRole('button', { name: PARTNER.displayName })
    expect(segmentActive(holderMe)).toBe(false)
    expect(segmentActive(holderPartner)).toBe(false)
    expect(chipSelected(insuredMe)).toBe(false)
    expect(chipSelected(insuredPartner)).toBe(false)
    expect(chipSelected(screen.getByRole('button', { name: ts.insuredFreeform }))).toBe(false)
    expect(screen.queryByPlaceholderText(ts.insuredPlaceholder)).toBeNull()

    expect(saveButton()).toBeDisabled()
  })

  it('picking both resolves the sheet; the payload carries only current-member ids', async () => {
    render(
      <InsuranceSheetBody open onClose={() => {}} initial={{ ...base, insPolicyHolderFormer: true, insInsuredFormer: true }} />,
      { wrapper: Wrapper },
    )
    const [holderMe] = screen.getAllByRole('button', { name: ME_LABEL })
    fireEvent.click(holderMe)
    expect(screen.queryByText(ts.policyHolderFormerHint)).toBeNull()
    expect(saveButton()).toBeDisabled() // 被保人 still unresolved

    const [, insuredPartner] = screen.getAllByRole('button', { name: PARTNER.displayName })
    fireEvent.click(insuredPartner)
    expect(screen.queryByText(ts.insuredFormerHint)).toBeNull()
    expect(saveButton()).toBeEnabled()

    fireEvent.click(saveButton())
    await waitFor(() => expect(editInsurance).toHaveBeenCalledOnce())
    expect(editInsurance.mock.calls[0][0]).toMatchObject({
      id: 'ins-1',
      policyHolderUserId: VIEWER.id,
      insuredUserId: PARTNER.id,
      insuredChildId: null,
    })
  })

  it('picking 自行輸入 resolves the insured to freeform text', async () => {
    render(
      <InsuranceSheetBody open onClose={() => {}} initial={{ ...base, insPolicyHolderUserId: VIEWER.id, insInsuredFormer: true }} />,
      { wrapper: Wrapper },
    )
    expect(saveButton()).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: ts.insuredFreeform }))
    const input = screen.getByPlaceholderText(ts.insuredPlaceholder)
    fireEvent.change(input, { target: { value: '阿嬤' } })
    expect(saveButton()).toBeEnabled()
    fireEvent.click(saveButton())
    await waitFor(() => expect(editInsurance).toHaveBeenCalledOnce())
    expect(editInsurance.mock.calls[0][0]).toMatchObject({
      policyHolderUserId: VIEWER.id, insuredUserId: null, insuredChildId: null, insured: '阿嬤',
    })
  })

  it('solo ledger with a former holder: the field shows with the single 我 option and the hint', () => {
    partner = null
    render(
      <InsuranceSheetBody open onClose={() => {}} initial={{ ...base, insPolicyHolderFormer: true }} />,
      { wrapper: Wrapper },
    )
    expect(screen.getByText(ts.policyHolder)).toBeInTheDocument()
    expect(screen.getByText(ts.policyHolderFormerHint)).toBeInTheDocument()
    const [holderMe] = screen.getAllByRole('button', { name: ME_LABEL })
    expect(segmentActive(holderMe)).toBe(false)
    expect(saveButton()).toBeDisabled()
    fireEvent.click(holderMe)
    expect(segmentActive(holderMe)).toBe(true)
    expect(saveButton()).toBeEnabled()
  })
})

describe('InsuranceSheetBody — unchanged paths (#1579 control)', () => {
  it('legacy NULL holder (not former) in solo mode: field hidden, defaults to the viewer, save enabled', async () => {
    partner = null
    render(<InsuranceSheetBody open onClose={() => {}} initial={base} />, { wrapper: Wrapper })
    expect(screen.queryByText(ts.policyHolder)).toBeNull()
    expect(screen.queryByText(ts.policyHolderFormerHint)).toBeNull()
    expect(saveButton()).toBeEnabled()
    fireEvent.click(saveButton())
    await waitFor(() => expect(editInsurance).toHaveBeenCalledOnce())
    expect(editInsurance.mock.calls[0][0]).toMatchObject({ policyHolderUserId: VIEWER.id })
  })

  it('current-member holder and freeform insured: preselected as stored, no hints', () => {
    render(
      <InsuranceSheetBody open onClose={() => {}} initial={{ ...base, insPolicyHolderUserId: PARTNER.id, insInsured: '阿嬤' }} />,
      { wrapper: Wrapper },
    )
    const [holderMe] = screen.getAllByRole('button', { name: ME_LABEL })
    const [holderPartner] = screen.getAllByRole('button', { name: PARTNER.displayName })
    expect(segmentActive(holderMe)).toBe(false)
    expect(segmentActive(holderPartner)).toBe(true)
    expect(chipSelected(screen.getByRole('button', { name: ts.insuredFreeform }))).toBe(true)
    expect(screen.queryByText(ts.policyHolderFormerHint)).toBeNull()
    expect(screen.queryByText(ts.insuredFormerHint)).toBeNull()
    expect(saveButton()).toBeEnabled()
  })
})
