/**
 * Shared types for the CSV import pipeline. Lives in its own file so parser /
 * detector / mapper / validator don't have to import from each other.
 */

export type ImportRowType = 'expense' | 'income'
export type ImportPaidBy = 'viewer' | 'partner'
export type ImportSplitType = 'half' | 'all_mine' | 'all_theirs' | 'weighted'

/**
 * Normalised row produced by the mapper layer.
 *
 * `type` extends the user-facing shape in the issue brief — the spec
 * (csv-import-design.md) routes expense rows to `CashTransactions` and income
 * rows to `IncomeTransactions`, so the kind must be carried explicitly.
 * `paidBy` stays generic (viewer/partner) until the import action resolves it
 * against the group's actual `member_a` / `member_b` profile ids.
 */
export interface ImportRow {
  date: Date
  amount: number               // base-currency integer
  type: ImportRowType
  category: string             // Futari category id (validator falls back to 'other')
  description: string
  paidBy: ImportPaidBy
  splitType: ImportSplitType
  originalCurrency?: string
  originalAmount?: number
}

export type PartialImportRow = Partial<ImportRow>

export interface HeaderMap {
  date: string
  amount: string
  category?: string
  description?: string
  type?: string                 // optional explicit expense/income column
  currency?: string
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface RowError {
  rowIndex: number              // 0-based index into the parsed CSV rows
  errors: string[]
}
