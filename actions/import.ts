'use server'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  cashTransactions,
  importBatches,
  importErrors,
  incomeTransactions,
} from '@/lib/db/schema'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { getViewerWriteContext } from '@/lib/actionContext'
import { revalidateAfterImportMutation } from '@/lib/revalidate'
import { isValidCategoryId } from '@/lib/categories'
import { isValidIncomeCategoryId } from '@/lib/incomeCategories'

/**
 * #607 — Server-side CSV import.
 *
 * The client runs `lib/csvImport/processFile` against the uploaded file,
 * collects user-supplied payer / split / category overrides via the wizard,
 * and posts the validated row list here. This action re-validates every
 * field (amount, type, splitType, payer-in-group) so a stale or malicious
 * client cannot bypass schema invariants, then writes the batch atomically:
 *
 *   1. ImportBatches row (pending → completed in the same tx)
 *   2. CashTransactions / IncomeTransactions, tagged with import_batch_id
 *   3. ImportErrors for rows that failed parse / validation on the client
 *   4. recalcGroupBalance — balance cache is correct before the tx commits
 *
 * Rollback (`rollbackImportBatch`) is a soft delete on every tagged row plus
 * `rolled_back_at` on the batch; balance is recomputed from the active set.
 */

const VALID_SOURCES = ['honeydue', 'spendee', 'cwmoney', 'generic'] as const
export type ImportSource = (typeof VALID_SOURCES)[number]

const VALID_PAYERS = ['a', 'b'] as const
export type ImportPayerMember = (typeof VALID_PAYERS)[number]

const VALID_SPLIT_TYPES = ['all_mine', 'all_theirs', 'half', 'weighted'] as const
type ImportSplitType = (typeof VALID_SPLIT_TYPES)[number]

const VALID_ROW_TYPES = ['expense', 'income'] as const
type ImportRowType = (typeof VALID_ROW_TYPES)[number]

const MAX_AMOUNT = 9_999_999

export interface ImportBatchInputRow {
  type: ImportRowType
  /** Base-currency integer. */
  amount: number
  /** Calendar date string 'YYYY-MM-DD'. */
  date: string
  /** Futari category id. Validator falls back to 'other' if unknown. */
  category: string
  description: string
  /** Resolves to memberA or memberB on the server. */
  paidBy: ImportPayerMember
  splitType: ImportSplitType
  splitRatioA?: number | null
  originalCurrency?: string | null
  originalAmount?: number | null
}

export interface ImportBatchErrorRow {
  rowNumber: number
  rawRow: Record<string, string>
  errorType: 'parse_error' | 'missing_field' | 'invalid_date' | 'invalid_amount' | 'duplicate'
  errorDetail?: string
}

export interface ImportBatchInput {
  source: ImportSource
  fileName: string
  /** Raw row count from the CSV (valid + invalid). */
  totalRows: number
  rows: ImportBatchInputRow[]
  errors: ImportBatchErrorRow[]
}

export interface ImportBatchResult {
  batchId: string
  importedCount: number
  errorCount: number
}

function assertSource(source: string): asserts source is ImportSource {
  if (!(VALID_SOURCES as readonly string[]).includes(source)) {
    throw new Error(`未支援的匯入來源：${source}`)
  }
}

function validateRow(row: ImportBatchInputRow, index: number): void {
  if (!(VALID_ROW_TYPES as readonly string[]).includes(row.type)) {
    throw new Error(`第 ${index + 1} 筆：交易類型不正確`)
  }
  if (
    !Number.isFinite(row.amount)
    || !Number.isInteger(row.amount)
    || row.amount <= 0
    || row.amount > MAX_AMOUNT
  ) {
    throw new Error(`第 ${index + 1} 筆：金額不正確`)
  }
  if (!(VALID_SPLIT_TYPES as readonly string[]).includes(row.splitType)) {
    throw new Error(`第 ${index + 1} 筆：分攤方式不正確`)
  }
  if (!(VALID_PAYERS as readonly string[]).includes(row.paidBy)) {
    throw new Error(`第 ${index + 1} 筆：付款人不正確`)
  }
  if (row.splitType === 'weighted') {
    if (
      row.splitRatioA === undefined
      || row.splitRatioA === null
      || !Number.isInteger(row.splitRatioA)
      || row.splitRatioA < 0
      || row.splitRatioA > 100
    ) {
      throw new Error(`第 ${index + 1} 筆：依比例分需要 0–100 的比例`)
    }
  }
  // Multi-currency tuple: all-or-nothing
  const hasCurrency = !!row.originalCurrency
  const hasOrigAmount = row.originalAmount !== undefined && row.originalAmount !== null
  if (hasCurrency !== hasOrigAmount) {
    throw new Error(`第 ${index + 1} 筆：外幣資訊不完整`)
  }
  // Date format: YYYY-MM-DD or any string Date can parse
  const parsed = new Date(row.date)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`第 ${index + 1} 筆：日期不正確`)
  }
}

function resolvePayerId(
  paidBy: ImportPayerMember,
  group: { memberA: string; memberB: string | null },
): string {
  if (paidBy === 'a') return group.memberA
  if (!group.memberB) {
    // Solo group: only one person. Force everything to memberA, ignoring 'b'.
    return group.memberA
  }
  return group.memberB
}

function normaliseSplitType(
  splitType: ImportSplitType,
  hasPartner: boolean,
): ImportSplitType {
  // Solo group has no one to split with — force 'all_mine'.
  if (!hasPartner) return 'all_mine'
  return splitType
}

function normaliseCategory(category: string, type: ImportRowType): string {
  const trimmed = (category ?? '').trim()
  if (!trimmed) return 'other'
  if (type === 'expense') {
    return isValidCategoryId(trimmed) ? trimmed : 'other'
  }
  return isValidIncomeCategoryId(trimmed) ? trimmed : 'other'
}

export async function importCsvBatch(
  input: ImportBatchInput,
): Promise<ImportBatchResult> {
  assertSource(input.source)
  if (!input.fileName || input.fileName.length > 255) {
    throw new Error('檔名不正確')
  }
  if (!Number.isInteger(input.totalRows) || input.totalRows < 0) {
    throw new Error('總筆數不正確')
  }
  if (input.rows.length === 0 && input.errors.length === 0) {
    throw new Error('沒有可匯入的資料')
  }

  input.rows.forEach((r, i) => validateRow(r, i))

  const { user, group } = await getViewerWriteContext()
  const hasPartner = group.memberB !== null

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        groupId: group.id,
        importedBy: user.id,
        source: input.source,
        fileName: input.fileName,
        totalRows: input.totalRows,
        importedCount: 0,
        skippedCount: 0,
        errorCount: input.errors.length,
        status: 'pending',
      })
      .returning({ id: importBatches.id })

    if (!batch) throw new Error('建立匯入紀錄失敗')

    const cashRows = input.rows.filter((r) => r.type === 'expense')
    const incomeRows = input.rows.filter((r) => r.type === 'income')

    // MVP: drop the multi-currency tuple. The DB enforces an all-or-nothing
    // CHECK on (original_currency, original_amount, rate_snapshot) — writing
    // just two of the three fails the constraint, and we don't have a real
    // rate snapshot at import time (no per-batch rate, no historical lookup).
    // For now everything is treated as already in base currency. Foreign-
    // currency CSVs (Spendee with a Currency column) get imported with their
    // raw amount; users adjust individual rows after import. A future PR can
    // add a per-batch rate step to the wizard.

    if (cashRows.length > 0) {
      await tx.insert(cashTransactions).values(
        cashRows.map((r) => ({
          groupId: group.id,
          paidBy: resolvePayerId(r.paidBy, group),
          amount: r.amount,
          splitType: normaliseSplitType(r.splitType, hasPartner),
          splitRatioA: r.splitType === 'weighted' ? (r.splitRatioA ?? null) : null,
          description: r.description || '匯入紀錄',
          category: normaliseCategory(r.category, 'expense'),
          transactedAt: new Date(r.date),
          importBatchId: batch.id,
        })),
      )
    }

    if (incomeRows.length > 0) {
      await tx.insert(incomeTransactions).values(
        incomeRows.map((r) => ({
          groupId: group.id,
          recipientId: resolvePayerId(r.paidBy, group),
          amount: r.amount,
          category: normaliseCategory(r.category, 'income'),
          source: r.description || null,
          occurredAt: r.date,
          importBatchId: batch.id,
        })),
      )
    }

    if (input.errors.length > 0) {
      await tx.insert(importErrors).values(
        input.errors.map((e) => ({
          batchId: batch.id,
          // row_number CHECK > 0 — clamp client-supplied 0-indexed values up.
          rowNumber: e.rowNumber > 0 ? e.rowNumber : 1,
          rawRow: e.rawRow,
          errorType: e.errorType,
          errorDetail: e.errorDetail ?? null,
        })),
      )
    }

    await tx
      .update(importBatches)
      .set({
        importedCount: input.rows.length,
        status: 'completed',
      })
      .where(eq(importBatches.id, batch.id))

    await recalcGroupBalance(group.id, tx)

    return { batchId: batch.id }
  })

  revalidateAfterImportMutation()

  return {
    batchId: result.batchId,
    importedCount: input.rows.length,
    errorCount: input.errors.length,
  }
}

export async function rollbackImportBatch(batchId: string): Promise<void> {
  if (!batchId || typeof batchId !== 'string') {
    throw new Error('批次 ID 不正確')
  }

  const { group } = await getViewerWriteContext()

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({
        id: importBatches.id,
        groupId: importBatches.groupId,
        status: importBatches.status,
        rolledBackAt: importBatches.rolledBackAt,
      })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
      .limit(1)

    if (!batch) throw new Error('找不到匯入紀錄')
    if (batch.groupId !== group.id) throw new Error('無權限復原這次匯入')
    if (batch.status === 'rolled_back' || batch.rolledBackAt !== null) {
      throw new Error('這次匯入已經復原過')
    }

    const now = new Date()

    // Soft delete to keep the audit trail consistent with editing semantics.
    // Rows are still queryable for the import batch detail view; balance
    // filters on deletedAt IS NULL so the cache rebuilds correctly.
    await tx
      .update(cashTransactions)
      .set({ deletedAt: now })
      .where(
        and(
          eq(cashTransactions.importBatchId, batchId),
          isNull(cashTransactions.deletedAt),
        ),
      )

    await tx
      .update(incomeTransactions)
      .set({ deletedAt: now })
      .where(
        and(
          eq(incomeTransactions.importBatchId, batchId),
          isNull(incomeTransactions.deletedAt),
        ),
      )

    await tx
      .update(importBatches)
      .set({ status: 'rolled_back', rolledBackAt: now })
      .where(eq(importBatches.id, batchId))

    await recalcGroupBalance(group.id, tx)
  })

  revalidateAfterImportMutation()
}

export interface ImportBatchSummary {
  id: string
  source: string
  fileName: string
  totalRows: number
  importedCount: number
  errorCount: number
  status: string
  createdAt: Date
  rolledBackAt: Date | null
  /** True iff the batch is within the 24h rollback window AND not yet rolled
   *  back. The UI uses this to enable / hide the rollback button. */
  rollbackable: boolean
}

const ROLLBACK_WINDOW_MS = 24 * 60 * 60 * 1000

export async function getImportHistory(): Promise<ImportBatchSummary[]> {
  const { group } = await getViewerWriteContext()

  const rows = await db
    .select({
      id: importBatches.id,
      source: importBatches.source,
      fileName: importBatches.fileName,
      totalRows: importBatches.totalRows,
      importedCount: importBatches.importedCount,
      errorCount: importBatches.errorCount,
      status: importBatches.status,
      createdAt: importBatches.createdAt,
      rolledBackAt: importBatches.rolledBackAt,
    })
    .from(importBatches)
    .where(eq(importBatches.groupId, group.id))
    .orderBy(desc(importBatches.createdAt))
    .limit(5)

  const now = Date.now()
  return rows.map((r) => ({
    ...r,
    rollbackable:
      r.rolledBackAt === null
      && r.status === 'completed'
      && now - r.createdAt.getTime() < ROLLBACK_WINDOW_MS,
  }))
}

/**
 * Lightweight count exposed for `getImportHistory`-less surfaces (e.g. unit
 * tests). Kept here so the action file owns every import-batch query.
 */
export async function countImportBatches(): Promise<number> {
  const { group } = await getViewerWriteContext()
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(importBatches)
    .where(eq(importBatches.groupId, group.id))
  return result[0]?.count ?? 0
}
