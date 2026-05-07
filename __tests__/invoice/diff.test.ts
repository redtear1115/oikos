import { describe, it, expect } from 'vitest'
import {
  diffInvoices,
  type LiveTxnRow,
  type SnapshotRow,
} from '@/lib/invoice/diff'
import type { InvStatus, MofInvoiceHeader } from '@/lib/invoice/api'

const BARCODE = '/AB12CD3'

function inv(
  invNum: string,
  amount: string,
  invStatus: InvStatus,
  sellerName = '全家便利商店',
): MofInvoiceHeader {
  return {
    invNum,
    invDate: '2026-05-05',
    sellerName,
    amount,
    invStatus,
    invDonatable: 'N',
    cardType: '3J0002',
    cardNo: BARCODE,
  }
}

function mapBy<T extends { invoiceNumber: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.invoiceNumber, r]))
}

describe('diffInvoices — spec §「偵測機制」 truth table', () => {
  it('case 1: 全新發票 (no snapshot, status=開立) → new', () => {
    const result = diffInvoices(
      [inv('AB10000001', '55', '開立')],
      mapBy<SnapshotRow>([]),
      mapBy<LiveTxnRow>([]),
    )
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('new')
    if (result[0].kind === 'new') {
      expect(result[0].invoice.invNum).toBe('AB10000001')
    }
  })

  it('case 2: 全新但作廢 (no snapshot, status=作廢) → skip_void', () => {
    const result = diffInvoices(
      [inv('AB10000003', '480', '作廢')],
      mapBy<SnapshotRow>([]),
      mapBy<LiveTxnRow>([]),
    )
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('skip_void')
  })

  it('case 3: 已匯入無變化 (snapshot + live aligned, MoF 開立 + 同金額) → already_imported', () => {
    const result = diffInvoices(
      [inv('AB10000001', '55', '開立')],
      mapBy<SnapshotRow>([
        { invoiceNumber: 'AB10000001', importedAmount: 55, voidedAt: null },
      ]),
      mapBy<LiveTxnRow>([
        { invoiceNumber: 'AB10000001', amount: 55, deletedAt: null },
      ]),
    )
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('already_imported')
  })

  it('case 4: 已匯入 → 變作廢 (live aligned, MoF=作廢) → needs_void', () => {
    const result = diffInvoices(
      [inv('AB10000003', '480', '作廢')],
      mapBy<SnapshotRow>([
        { invoiceNumber: 'AB10000003', importedAmount: 480, voidedAt: null },
      ]),
      mapBy<LiveTxnRow>([
        { invoiceNumber: 'AB10000003', amount: 480, deletedAt: null },
      ]),
    )
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('needs_void')
    if (result[0].kind === 'needs_void') {
      expect(result[0].snapshot.importedAmount).toBe(480)
    }
  })

  it('case 5: 已匯入 → 折讓 (MoF amount < snapshot, live aligned) → needs_allowance with newAmount', () => {
    const result = diffInvoices(
      // snapshot 1000 → MoF 700 (折讓 -300)
      [inv('AB10000004', '700', '開立', '全聯實業股份有限公司')],
      mapBy<SnapshotRow>([
        { invoiceNumber: 'AB10000004', importedAmount: 1000, voidedAt: null },
      ]),
      mapBy<LiveTxnRow>([
        { invoiceNumber: 'AB10000004', amount: 1000, deletedAt: null },
      ]),
    )
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('needs_allowance')
    if (result[0].kind === 'needs_allowance') {
      expect(result[0].newAmount).toBe(700)
      expect(result[0].snapshot.importedAmount).toBe(1000)
    }
  })

  it('case 6: 已匯入 + user 編輯過 + MoF 又變動 → conflict', () => {
    // snapshot importedAmount=1000, user 編輯成 950 (live.amount=950), MoF 又變 700
    const result = diffInvoices(
      [inv('AB10000004', '700', '開立', '全聯實業股份有限公司')],
      mapBy<SnapshotRow>([
        { invoiceNumber: 'AB10000004', importedAmount: 1000, voidedAt: null },
      ]),
      mapBy<LiveTxnRow>([
        { invoiceNumber: 'AB10000004', amount: 950, deletedAt: null },
      ]),
    )
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('conflict')
    if (result[0].kind === 'conflict') {
      expect(result[0].snapshot.importedAmount).toBe(1000)
    }
  })

  it('preserves input order across mixed cases', () => {
    const result = diffInvoices(
      [
        inv('AB10000001', '55', '開立'),                     // new
        inv('AB10000003', '480', '作廢'),                    // skip_void (no snapshot)
        inv('AB10000004', '700', '開立'),                    // needs_allowance
      ],
      mapBy<SnapshotRow>([
        { invoiceNumber: 'AB10000004', importedAmount: 1000, voidedAt: null },
      ]),
      mapBy<LiveTxnRow>([
        { invoiceNumber: 'AB10000004', amount: 1000, deletedAt: null },
      ]),
    )
    expect(result.map((r) => r.kind)).toEqual([
      'new',
      'skip_void',
      'needs_allowance',
    ])
  })

  it('skips rows where live txn was user-soft-deleted (spec: 不自動復活)', () => {
    // snapshot exists, but the live cashTxn was soft-deleted by the user.
    // Spec §「Edge cases」: skip — 尊重使用者刪除意圖.
    const result = diffInvoices(
      [inv('AB10000001', '55', '開立')],
      mapBy<SnapshotRow>([
        { invoiceNumber: 'AB10000001', importedAmount: 55, voidedAt: null },
      ]),
      mapBy<LiveTxnRow>([
        {
          invoiceNumber: 'AB10000001',
          amount: 55,
          deletedAt: new Date('2026-04-01'),
        },
      ]),
    )
    expect(result).toEqual([])
  })
})
