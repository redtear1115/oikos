/**
 * Single source of truth for fuel types. `FuelType` mirrors the `fuel_type`
 * DB enum (incl. '92' legacy + 'electric'); `GasFuelType` is the form-input
 * subset since electric cars don't refuel.
 */
export const FUEL_TYPES = ['92', '95', '98', 'diesel', 'electric'] as const
export type FuelType = (typeof FUEL_TYPES)[number]

export const GAS_FUEL_TYPES = ['92', '95', '98', 'diesel'] as const
export type GasFuelType = (typeof GAS_FUEL_TYPES)[number]
