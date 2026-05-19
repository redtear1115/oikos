import { useReducer } from 'react'
import type { AddSheetInitial } from './AddSheet'
import type { SettlementSheetInitial } from './SettlementSheet'
import type { IncomeSheetInitial } from './IncomeSheet'
import type { NewFuelLogInitial } from '@/app/(dashboard)/assets/[id]/_components/NewFuelLog'
import type { FuelType } from '@/lib/fuel'

export type ModalState =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'income' }
  | { kind: 'edit-income'; data: IncomeSheetInitial }
  | { kind: 'edit-pending'; pendingId: string; data: IncomeSheetInitial }
  | { kind: 'edit-pending-expense'; pendingId: string; data: AddSheetInitial }
  | { kind: 'edit-tx'; data: AddSheetInitial }
  | { kind: 'edit-settlement'; data: SettlementSheetInitial }

export type FuelCar = {
  id: string
  name: string
  plate: string
  fuelType: FuelType | null
  primaryUserId: string | null
}

export type FuelSheetState = {
  open: boolean
  initial: NewFuelLogInitial | null
  car: FuelCar | null
}

export type DashboardMode = 'expense' | 'income'
export type DashboardPayer = 'all' | 'me' | 'partner'
export type DashboardSplit = 'all' | 'mine' | 'theirs'

export interface DashboardState {
  mode: DashboardMode
  modal: ModalState
  payerFilter: DashboardPayer
  splitFilter: DashboardSplit
  tripSheetOpen: boolean
  fuelSheet: FuelSheetState
  showFirstCard: boolean
  toast: string | null
  bannerDismissed: boolean
}

export type DashboardAction =
  | { type: 'setMode'; mode: DashboardMode }
  | { type: 'openModal'; modal: ModalState }
  | { type: 'closeModal' }
  | { type: 'setPayerFilter'; value: DashboardPayer }
  | { type: 'setSplitFilter'; value: DashboardSplit }
  | { type: 'openTripSheet' }
  | { type: 'closeTripSheet' }
  | { type: 'openFuelSheet'; initial: NewFuelLogInitial; car: FuelCar }
  | { type: 'closeFuelSheet' }
  | { type: 'setShowFirstCard'; show: boolean }
  | { type: 'setToast'; toast: string | null }
  | { type: 'setBannerDismissed'; dismissed: boolean }

export const initialDashboardState: DashboardState = {
  mode: 'expense',
  modal: { kind: 'closed' },
  payerFilter: 'all',
  splitFilter: 'all',
  tripSheetOpen: false,
  fuelSheet: { open: false, initial: null, car: null },
  showFirstCard: false,
  toast: null,
  bannerDismissed: false,
}

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'setMode':
      return state.mode === action.mode ? state : { ...state, mode: action.mode }
    case 'openModal':
      return { ...state, modal: action.modal }
    case 'closeModal':
      return state.modal.kind === 'closed' ? state : { ...state, modal: { kind: 'closed' } }
    case 'setPayerFilter':
      return state.payerFilter === action.value ? state : { ...state, payerFilter: action.value }
    case 'setSplitFilter':
      return state.splitFilter === action.value ? state : { ...state, splitFilter: action.value }
    case 'openTripSheet':
      return state.tripSheetOpen ? state : { ...state, tripSheetOpen: true }
    case 'closeTripSheet':
      return state.tripSheetOpen ? { ...state, tripSheetOpen: false } : state
    case 'openFuelSheet':
      return { ...state, fuelSheet: { open: true, initial: action.initial, car: action.car } }
    case 'closeFuelSheet':
      return state.fuelSheet.open ? { ...state, fuelSheet: { ...state.fuelSheet, open: false } } : state
    case 'setShowFirstCard':
      return state.showFirstCard === action.show ? state : { ...state, showFirstCard: action.show }
    case 'setToast':
      return state.toast === action.toast ? state : { ...state, toast: action.toast }
    case 'setBannerDismissed':
      return state.bannerDismissed === action.dismissed ? state : { ...state, bannerDismissed: action.dismissed }
  }
}

export function useDashboardReducer() {
  return useReducer(dashboardReducer, initialDashboardState)
}
