/**
 * Pure diff: classify each MoF invoice into one of six cases by triangulating
 * against InvoiceImportSnapshots (what we've imported before) and live
 * CashTransaction rows (what's currently in the ledger). No DB or network IO
 * here — this is the business logic that Phase B's `previewInvoiceImport`
 * server action calls after it has loaded both maps.
 *
 * See spec §「偵測機制」 (docs/superpowers/specs/0_9_0-cloud-invoice-design.md)
 * for the truth table this implements.
 */
import type { MofInvoiceHeader } from './api'

export type SnapshotRow = {
  invoiceNumber: string
  importedAmount: number
  voidedAt: Date | null
}

export type LiveTxnRow = {
  invoiceNumber: string
  amount: number
  deletedAt: Date | null
}

export type DiffResult =
  | { kind: 'new'; invoice: MofInvoiceHeader }
  | { kind: 'skip_void'; invoice: MofInvoiceHeader }
  | { kind: 'already_imported'; invoice: MofInvoiceHeader }
  | { kind: 'needs_void'; invoice: MofInvoiceHeader; snapshot: SnapshotRow }
  | {
      kind: 'needs_allowance'
      invoice: MofInvoiceHeader
      snapshot: SnapshotRow
      newAmount: number
    }
  | { kind: 'conflict'; invoice: MofInvoiceHeader; snapshot: SnapshotRow }

/**
 * Classify each MoF invoice. The output preserves input order so callers can
 * stably render a preview list grouped by section without resorting.
 *
 * Decision order (mirrors the spec table):
 *   1. snapshot exists + live txn user-edited (cashTxn.amount ≠ snapshot)
 *      AND MoF still differs → conflict
 *   2. snapshot missing → new (open) or skip_void (作廢)
 *   3. snapshot + live txn aligned + MoF 作廢 → needs_void
 *   4. snapshot + live txn aligned + MoF 開立 + amount drop → needs_allowance
 *   5. snapshot + live txn aligned + MoF 開立 + amount unchanged → already_imported
 *
 * Cases not covered by the brief's six (e.g. snapshot exists but live txn
 * missing — user soft-deleted) are skipped entirely; the snapshot stays as
 * historical record per spec §「Edge cases」 ("尊重使用者刪除意圖；不自動復活").
 */
export function diffInvoices(
  mofInvoices: MofInvoiceHeader[],
  snapshots: Map<string, SnapshotRow>,
  liveTxns: Map<string, LiveTxnRow>,
): DiffResult[] {
  const out: DiffResult[] = []

  for (const inv of mofInvoices) {
    const snap = snapshots.get(inv.invNum)

    if (!snap) {
      // 全新發票 → new；首次就作廢 → skip_void
      if (inv.invStatus === '作廢') {
        out.push({ kind: 'skip_void', invoice: inv })
      } else {
        out.push({ kind: 'new', invoice: inv })
      }
      continue
    }

    const live = liveTxns.get(inv.invNum)
    // snapshot 存在但 live txn 不見 → user 軟刪了，spec 要求 skip
    if (!live || live.deletedAt !== null) {
      continue
    }

    const userEdited = live.amount !== snap.importedAmount
    const mofAmount = parseInvoiceAmount(inv.amount)
    const mofChanged =
      inv.invStatus === '作廢' || mofAmount !== snap.importedAmount

    // user 編輯過 + MoF 又變動 → 衝突，由 user 決定 (spec §「偵測機制」)
    if (userEdited && mofChanged) {
      out.push({ kind: 'conflict', invoice: inv, snapshot: snap })
      continue
    }

    if (inv.invStatus === '作廢') {
      out.push({ kind: 'needs_void', invoice: inv, snapshot: snap })
      continue
    }

    if (mofAmount < snap.importedAmount) {
      out.push({
        kind: 'needs_allowance',
        invoice: inv,
        snapshot: snap,
        newAmount: mofAmount,
      })
      continue
    }

    // 開立 + 金額一致 → 已匯入無變化
    out.push({ kind: 'already_imported', invoice: inv })
  }

  return out
}

function parseInvoiceAmount(raw: string): number {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid MoF invoice amount: ${raw}`)
  }
  return n
}
