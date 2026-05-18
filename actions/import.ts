'use server'

import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import {
  cashTransactions,
  importBatches,
  incomeTransactions,
} from '@/lib/db/schema'
import { isValidCategoryId } from '@/lib/categories'
import { isValidIncomeCategoryId } from '@/lib/incomeCategories'
import { recalcGroupBalance } from '@/lib/db/queries/balance'
import { revalidateAfterIncomeMutation, revalidateAfterTransactionMutation } from '@/lib/revalidate'
import { getViewerWriteContext } from '@/lib/actionContext'

/**
 * Wire-shape import row sent from the import wizard to the Server Action.
 *
 * Mirrors `lib/csvImport/types.ts#ImportRow` but with `date` as YYYY-MM-DD so
 * it survives the serialization boundary. The category mapping wizard has
 * already overridden raw competitor labels to Futari `CategoryId` (or income
 * category id) values by the time we reach the server.
 */
export interface ImportRowWire {
  date: string                                   // YYYY-MM-DD
  amount: number                                 // base-currency positive integer
  type: 'expense' | 'income'
  category: string                               // Futari category id (falls back to 'other')
  description: string
  paidBy: 'viewer' | 'partner'
  splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
}

export interface ImportBatchOptions {
  /** Free-text label, e.g. `'honeydue'` / `'spendee'` / `'cwmoney'` / `'generic'`.
   *  Stored on `ImportBatches.source` for audit / future grouping. */
  source: string
  /** Original filename — surfaced in the result page and stored for audit. */
  fileName: string
  /** Drop rows that hash-match an existing CashTransaction (spec §Dedup). */
  skipDuplicates: boolean
}

export interface ImportBatchResult {
  batchId: string
  imported: number
  skipped: number
}

const RE_YMD = /^\d{4}-\d{2}-\d{2}$/

function dedupHash(input: {
  date: string
  amount: number
  paidBy: string
  category: string
  description: string
}): string {
  // Per spec (csv-import-design.md §Dedup): sha256 of canonical-joined fields,
  // description truncated to first 10 chars so trivial note variants still
  // collide. paid_by uses the resolved Profile uuid (not viewer/partner) so the
  // same hash forms whether the row is freshly imported or already in DB.
  return createHash('sha256').update(
    [input.date, input.amount, input.paidBy, input.category, input.description.slice(0, 10)].join('|'),
  ).digest('hex')
}

function resolvePaidBy(
  paidBy: 'viewer' | 'partner',
  ids: { viewer: string; partner: string | null },
): string {
  // Solo group: partner side falls back to viewer so the row still lands;
  // the wizard locks split to `all_mine` upstream so balance impact is zero.
  if (paidBy === 'partner') return ids.partner ?? ids.viewer
  return ids.viewer
}

interface ResolvedRow extends ImportRowWire {
  resolvedPaidBy: string
  hash: string
}

function resolveRows(
  rows: readonly ImportRowWire[],
  ids: { viewer: string; partner: string | null },
): ResolvedRow[] {
  return rows.map((r) => {
    const resolvedPaidBy = resolvePaidBy(r.paidBy, ids)
    return {
      ...r,
      resolvedPaidBy,
      hash: dedupHash({
        date: r.date,
        amount: r.amount,
        paidBy: resolvedPaidBy,
        category: r.category,
        description: r.description,
      }),
    }
  })
}

/**
 * Pre-flight duplicate detection. Called from Step 4 of the wizard to render
 * "N 筆會被跳過". Reads CashTransactions only — the spec scopes hash-based
 * dedup to expenses (income rows have a different `recipient_id` axis that
 * doesn't fit the same hash shape).
 *
 * Returns the 0-based row indices into `rows` that collide with an existing
 * (non-soft-deleted) row in the viewer's group.
 */
export async function findImportDuplicates(
  rows: ImportRowWire[],
): Promise<{ duplicateIndices: number[] }> {
  if (rows.length === 0) return { duplicateIndices: [] }

  const { user, group } = await getViewerWriteContext()
  const ids = { viewer: user.id, partner: viewerPartnerId(group, user.id) }

  const resolved = resolveRows(rows.filter((r) => r.type === 'expense'), ids)
  if (resolved.length === 0) return { duplicateIndices: [] }

  // Indices in the *original* rows array — re-derive after the expense filter.
  const indexByHash = new Map<string, number[]>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    if (r.type !== 'expense') continue
    const resolvedPaidBy = resolvePaidBy(r.paidBy, ids)
    const h = dedupHash({
      date: r.date,
      amount: r.amount,
      paidBy: resolvedPaidBy,
      category: r.category,
      description: r.description,
    })
    const existing = indexByHash.get(h)
    if (existing) existing.push(i)
    else indexByHash.set(h, [i])
  }

  const existing = await db
    .select({
      transactedAt: cashTransactions.transactedAt,
      amount: cashTransactions.amount,
      paidBy: cashTransactions.paidBy,
      category: cashTransactions.category,
      description: cashTransactions.description,
    })
    .from(cashTransactions)
    .where(and(
      eq(cashTransactions.groupId, group.id),
      isNull(cashTransactions.deletedAt),
    ))

  const dupIndices: number[] = []
  for (const row of existing) {
    const date = row.transactedAt.toISOString().slice(0, 10)
    const h = dedupHash({
      date,
      amount: row.amount,
      paidBy: row.paidBy,
      category: row.category,
      description: row.description ?? '',
    })
    const colliding = indexByHash.get(h)
    if (colliding) dupIndices.push(...colliding)
  }
  // Deduplicate (a single existing row can collide with the same CSV row only
  // once; multiple CSV rows colliding with each other are flagged together).
  return { duplicateIndices: Array.from(new Set(dupIndices)).sort((a, b) => a - b) }
}

function viewerPartnerId(
  group: { memberA: string; memberB: string | null },
  viewerId: string,
): string | null {
  return group.memberA === viewerId ? group.memberB : group.memberA
}

function ymdToUtcTimestamp(ymd: string): Date {
  // Anchor at UTC noon so the calendar date round-trips losslessly across
  // every IANA timezone — matches `lib/local-date#ymdToUTCNoon`, kept inline
  // to avoid a server-only/client-shared dep on that module.
  return new Date(`${ymd}T12:00:00.000Z`)
}

/**
 * Atomic CSV import. Writes one `ImportBatches` row + bulk-inserts the
 * expense rows into `CashTransactions` and income rows into `IncomeTransactions`,
 * all in a single Drizzle transaction. Balance is recomputed inside the same
 * transaction so failures roll back balance state cleanly.
 *
 * On `skipDuplicates`, rows hash-matching existing CashTransactions are
 * silently dropped and counted toward `skipped`. Income rows are never
 * deduped — see `findImportDuplicates` for the rationale.
 */
export async function importCsvBatch(
  rows: ImportRowWire[],
  options: ImportBatchOptions,
): Promise<ImportBatchResult> {
  const { user, group } = await getViewerWriteContext()
  const ids = { viewer: user.id, partner: viewerPartnerId(group, user.id) }

  // Defense in depth: the parser layer already enforces these rules, but the
  // wire format is user-controllable so we re-check before touching the DB.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    if (!RE_YMD.test(r.date)) throw new Error(`第 ${i + 1} 列：日期格式無效`)
    if (!Number.isInteger(r.amount) || r.amount <= 0 || r.amount > 9_999_999) {
      throw new Error(`第 ${i + 1} 列：金額不是合法的正整數`)
    }
    if (r.description.length > 500) throw new Error(`第 ${i + 1} 列：備註超過 500 字`)
    if (r.type === 'expense' && !isValidCategoryId(r.category)) {
      throw new Error(`第 ${i + 1} 列：分類「${r.category}」無效`)
    }
    if (r.type === 'income' && !isValidIncomeCategoryId(r.category)) {
      throw new Error(`第 ${i + 1} 列：收入分類「${r.category}」無效`)
    }
  }

  const { duplicateIndices } = options.skipDuplicates
    ? await findImportDuplicates(rows)
    : { duplicateIndices: [] as number[] }
  const dupSet = new Set(duplicateIndices)

  const kept = rows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !dupSet.has(i))
    .map(({ r }) => r)

  const expenseRows = kept.filter((r) => r.type === 'expense')
  const incomeRows = kept.filter((r) => r.type === 'income')
  const skipped = duplicateIndices.length

  const result = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(importBatches)
      .values({
        groupId: group.id,
        importedBy: user.id,
        source: options.source,
        fileName: options.fileName,
        totalRows: rows.length,
        importedCount: kept.length,
        skippedCount: skipped,
        errorCount: 0,
        status: 'completed',
      })
      .returning({ id: importBatches.id })

    if (!batch) throw new Error('Failed to create import batch')

    if (expenseRows.length > 0) {
      await tx.insert(cashTransactions).values(
        expenseRows.map((r) => ({
          groupId: group.id,
          paidBy: resolvePaidBy(r.paidBy, ids),
          amount: r.amount,
          // Solo group: force `all_mine` so the row has no balance impact —
          // the wizard already locks the selector, but we defend the DB.
          splitType: ids.partner === null ? ('all_mine' as const) : r.splitType,
          description: r.description.trim() || '匯入紀錄',
          category: r.category,
          status: 'settled' as const,
          transactedAt: ymdToUtcTimestamp(r.date),
          importBatchId: batch.id,
        })),
      )
    }

    if (incomeRows.length > 0) {
      await tx.insert(incomeTransactions).values(
        incomeRows.map((r) => ({
          groupId: group.id,
          // Income has no split — `paidBy` from the wizard maps directly to recipient.
          recipientId: resolvePaidBy(r.paidBy, ids),
          amount: r.amount,
          category: r.category,
          source: r.description.trim() || null,
          // `date` column, not timestamptz — Drizzle accepts YYYY-MM-DD strings.
          occurredAt: r.date,
        })),
      )
    }

    await recalcGroupBalance(group.id, tx)

    return {
      batchId: batch.id,
      imported: kept.length,
      skipped,
    } satisfies ImportBatchResult
  })

  revalidateAfterTransactionMutation()
  if (incomeRows.length > 0) revalidateAfterIncomeMutation()
  return result
}

/**
 * Rollback a batch within 24 hours of import. Soft-deletes every
 * `CashTransactions` row tagged with this `importBatchId`, stamps
 * `rolledBackAt` on the batch, and recomputes balance.
 *
 * Income rows are not currently rolled back — they don't carry an
 * `import_batch_id` column yet (the schema PR shipped the FK only on
 * CashTransactions). When that column is added (#556 follow-up), wire
 * IncomeTransactions through the same path.
 */
export async function rollbackImportBatch(
  batchId: string,
): Promise<{ rolled: number }> {
  const { group } = await getViewerWriteContext()

  return await db.transaction(async (tx) => {
    const [batch] = await tx
      .select({
        id: importBatches.id,
        createdAt: importBatches.createdAt,
        rolledBackAt: importBatches.rolledBackAt,
      })
      .from(importBatches)
      .where(and(
        eq(importBatches.id, batchId),
        eq(importBatches.groupId, group.id),
      ))
      .limit(1)

    if (!batch) throw new Error('找不到該批次')
    if (batch.rolledBackAt) throw new Error('這個批次已經還原過了')
    const ageMs = Date.now() - batch.createdAt.getTime()
    if (ageMs > 24 * 60 * 60 * 1000) throw new Error('超過 24 小時，無法還原')

    const rolled = await tx
      .update(cashTransactions)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(cashTransactions.importBatchId, batchId),
        eq(cashTransactions.groupId, group.id),
        isNull(cashTransactions.deletedAt),
      ))
      .returning({ id: cashTransactions.id })

    await tx
      .update(importBatches)
      .set({ rolledBackAt: new Date(), status: 'rolled_back' })
      .where(eq(importBatches.id, batchId))

    await recalcGroupBalance(group.id, tx)
    return { rolled: rolled.length }
  })
}
