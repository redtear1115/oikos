// #1589 — editing a car whose 主要使用人 left the ledger, and adding a fuel log
// to it.
//
// The page sends no id for that person, only `primaryUserFormer`. The car
// sheet must start with no segment selected (primaryUserId null would
// otherwise light up 共用), show a hint, and — unless a person is picked —
// save with `primaryUserId: undefined`, which editCar treats as "keep the
// stored value". Picking stays optional.
//
// Failure looks like: the sheet opens with 共用 lit, and saving a brand change
// quietly turns the car into 共用 (a NULL write); or the fuel-log sheet splits
// the ex-partner's car half-and-half with the current partner.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import type { CarInitial } from '@/app/(dashboard)/assets/_components/AssetSheet/CarSheetBody'

const VIEWER = { id: 'a0a0a0a0-0000-4000-8000-0000000000a0', displayName: 'Me' }
const PARTNER = { id: 'd0d0d0d0-0000-4000-8000-0000000000d0', displayName: 'Dana' }
let partner: typeof PARTNER | null = PARTNER

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/assets',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(dashboard)/_components/MemberContext')>()),
  useMember: () => ({ viewer: VIEWER, partner, isSolo: partner === null, isPast: false, canAccessGuardian: true, viewerIsA: true }),
}))
const editCar = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, data: undefined }))
vi.mock('@/actions/asset', () => ({
  createCar: vi.fn(),
  editCar: (...args: unknown[]) => editCar(...args),
  softDeleteAsset: vi.fn(),
  softDeleteCar: vi.fn(),
}))
const createFuelLog = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, data: { id: 'f1' } }))
vi.mock('@/actions/fuelLog', () => ({
  createFuelLog: (...args: unknown[]) => createFuelLog(...args),
  editFuelLog: vi.fn(),
  softDeleteFuelLog: vi.fn(),
}))

import { CarSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/CarSheetBody'
import { NewFuelLog } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'

const ts = zhTW.assetSheet.car
const ME_LABEL = zhTW.common.me
const SHARED_LABEL = zhTW.common.shared

function Wrapper({ children }: { children: ReactNode }) {
  return <TranslationsProvider value={zhTW} locale="zh-TW">{children}</TranslationsProvider>
}

const base: CarInitial = {
  id: 'car-1', name: '小白', notes: null, carHasPlate: true, purchasedAt: null, purchasePrice: null,
  fuelType: '95', primaryUserId: null, color: null, year: null, brand: 'Toyota', model: null, initialOdometer: null,
}
const former: CarInitial = { ...base, primaryUserId: null, primaryUserFormer: true }

const saveButton = () => screen.getByRole('button', { name: zhTW.assetSheet.saveChanges })
const segmentActive = (el: HTMLElement) => (el.getAttribute('style') ?? '').includes('var(--toggle-segment-thumb)')
const lastEditPayload = () => editCar.mock.calls.at(-1)![0] as Record<string, unknown>

beforeEach(() => {
  partner = PARTNER
  editCar.mockClear()
  createFuelLog.mockClear()
})

describe('CarSheetBody — former 主要使用人 (#1589)', () => {
  it('duo: nothing selected (not 共用), hint shown, save allowed', () => {
    render(<CarSheetBody open onClose={() => {}} initial={former} />, { wrapper: Wrapper })
    expect(screen.getByText(ts.primaryUserFormerHint)).toBeInTheDocument()
    for (const name of [ME_LABEL, PARTNER.displayName, SHARED_LABEL]) {
      expect(segmentActive(screen.getByRole('button', { name }))).toBe(false)
    }
    expect(saveButton()).toBeEnabled()
  })

  it('duo: an unchanged save sends primaryUserId undefined (keep stored), never null', async () => {
    render(<CarSheetBody open onClose={() => {}} initial={former} />, { wrapper: Wrapper })
    fireEvent.click(saveButton())
    await waitFor(() => expect(editCar).toHaveBeenCalledTimes(1))
    expect(lastEditPayload().primaryUserId).toBeUndefined()
  })

  it('duo: picking the partner resolves the sheet and sends their id', async () => {
    render(<CarSheetBody open onClose={() => {}} initial={former} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: PARTNER.displayName }))
    expect(screen.queryByText(ts.primaryUserFormerHint)).toBeNull()
    expect(segmentActive(screen.getByRole('button', { name: PARTNER.displayName }))).toBe(true)
    fireEvent.click(saveButton())
    await waitFor(() => expect(editCar).toHaveBeenCalledTimes(1))
    expect(lastEditPayload().primaryUserId).toBe(PARTNER.id)
  })

  it('duo: picking 共用 is an explicit null', async () => {
    render(<CarSheetBody open onClose={() => {}} initial={former} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: SHARED_LABEL }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(editCar).toHaveBeenCalledTimes(1))
    const payload = lastEditPayload()
    expect('primaryUserId' in payload && payload.primaryUserId === null).toBe(true)
  })

  it('solo: toggle hidden as before, save keeps the stored value (undefined)', async () => {
    partner = null
    render(<CarSheetBody open onClose={() => {}} initial={former} />, { wrapper: Wrapper })
    expect(screen.queryByText(ts.primaryUser)).toBeNull()
    expect(screen.queryByText(ts.primaryUserFormerHint)).toBeNull()
    fireEvent.click(saveButton())
    await waitFor(() => expect(editCar).toHaveBeenCalledTimes(1))
    expect(lastEditPayload().primaryUserId).toBeUndefined()
  })

  it('control: a current primary user is preselected and sent back as-is', async () => {
    render(<CarSheetBody open onClose={() => {}} initial={{ ...base, primaryUserId: PARTNER.id, primaryUserFormer: false }} />, { wrapper: Wrapper })
    expect(screen.queryByText(ts.primaryUserFormerHint)).toBeNull()
    expect(segmentActive(screen.getByRole('button', { name: PARTNER.displayName }))).toBe(true)
    fireEvent.click(saveButton())
    await waitFor(() => expect(editCar).toHaveBeenCalledTimes(1))
    expect(lastEditPayload().primaryUserId).toBe(PARTNER.id)
  })
})

describe('NewFuelLog — default payer / split for a former primary user (#1589)', () => {
  const submit = async (car: { primaryUserId: string | null; primaryUserIsFormer: boolean }) => {
    render(
      <NewFuelLog open onClose={() => {}} mode="create" lastOdometer={null}
        car={{ id: 'car-1', name: '小白', fuelType: '95', ...car }} />,
      { wrapper: Wrapper },
    )
    const [liters, odometer, cost] = screen.getAllByRole('spinbutton')
    fireEvent.change(liters, { target: { value: '30' } })
    fireEvent.change(odometer, { target: { value: '12000' } })
    fireEvent.change(cost, { target: { value: '900' } })
    fireEvent.click(screen.getByRole('button', { name: zhTW.assetDetail.fuelLog.submit }))
    await waitFor(() => expect(createFuelLog).toHaveBeenCalledTimes(1))
    return createFuelLog.mock.calls[0][0] as { paidBy: string; splitType: string }
  }

  it('former → payer = viewer, all_mine (not 共用 half, not the partner)', async () => {
    expect(await submit({ primaryUserId: null, primaryUserIsFormer: true })).toMatchObject({ paidBy: VIEWER.id, splitType: 'all_mine' })
  })

  it('control: 共用 → viewer, half', async () => {
    expect(await submit({ primaryUserId: null, primaryUserIsFormer: false })).toMatchObject({ paidBy: VIEWER.id, splitType: 'half' })
  })

  it('control: partner → partner, all_mine', async () => {
    expect(await submit({ primaryUserId: PARTNER.id, primaryUserIsFormer: false })).toMatchObject({ paidBy: PARTNER.id, splitType: 'all_mine' })
  })
})
