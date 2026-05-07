/**
 * Cloud invoice API client.
 *
 * Phase A: mock fixture only — Phase B will swap to real MoF endpoint
 * (https://api.einvoice.nat.gov.tw/PB2CAPIVAN/invServ/InvServ).
 *
 * Mock vs. real is decided by:
 *   - INVOICE_MOCK_MODE=1   → always mock (debug)
 *   - MOF_INVOICE_APP_ID    → present means real client; absent means mock
 *
 * Mock fixture covers three scenarios per spec section 「分階段交付」:
 *   - new invoice (issued)
 *   - voided invoice (作廢)
 *   - allowance / adjustment (折讓 — original amount reduced)
 *
 * See docs/superpowers/specs/0_9_0-cloud-invoice-design.md for the API shape.
 */

export type InvStatus = '開立' | '作廢' | '已折讓'

export interface MofInvoiceHeader {
  invNum: string
  invDate: string         // YYYY-MM-DD
  sellerName: string
  amount: string          // string per MoF API; parse to int at consumer
  invStatus: InvStatus
  invDonatable: 'Y' | 'N'
  cardType: '3J0002'
  cardNo: string          // /AB12CD3
}

export interface MofInvoiceResponse {
  v: '0.5'
  code: string            // '200' on success
  msg: string
  details: MofInvoiceHeader[]
}

export interface FetchInvoicesArgs {
  barcode: string
  verificationCode: string  // plaintext, freshly decrypted by caller
  startDate: string         // YYYY-MM-DD
  endDate: string           // YYYY-MM-DD
}

export interface FetchInvoicesResult {
  ok: boolean
  code: string
  msg: string
  invoices: MofInvoiceHeader[]
}

/** True when the runtime is configured to use the mock fixture. */
export function isMockMode(): boolean {
  if (process.env.INVOICE_MOCK_MODE === '1') return true
  if (!process.env.MOF_INVOICE_APP_ID) return true
  return false
}

/**
 * Top-level entry. Returns a normalized result regardless of mock vs. real.
 * Real-API branch is stubbed and unreachable in Phase A; throws so anyone
 * setting MOF_INVOICE_APP_ID prematurely gets a clear signal.
 */
export async function fetchInvoicesByCarrier(
  args: FetchInvoicesArgs,
): Promise<FetchInvoicesResult> {
  if (isMockMode()) {
    return mockFetch(args)
  }
  // Phase B: real MoF API client lives here. Intentionally unimplemented —
  // see spec 「APP_ID 申請卡點」. Until APP_ID compliance path is settled
  // we keep this rail closed even when the env var is set.
  throw new Error(
    'Real MoF API client is not implemented yet. Set INVOICE_MOCK_MODE=1 to force the fixture.',
  )
}

// ─── Mock fixture ────────────────────────────────────────────────────────────

/**
 * Deterministic fixture: returns the same invoice list for the same barcode +
 * verification code regardless of date range (fixture invoice dates lie within
 * the typical "last month" window). 9XX codes simulate API failures.
 *
 * Trigger codes (testing) — set verificationCode to one of:
 *   FAIL919X — returns code 919 (wrong cardEncrypt)  → credential → invalid
 *   FAIL953X — returns code 953 (system busy)       → caller retries
 *   FAIL998X — returns code 998 (appID invalid)     → infra alert
 * Any other valid 8-char code returns code 200 + the canonical fixture list.
 */
async function mockFetch(args: FetchInvoicesArgs): Promise<FetchInvoicesResult> {
  // Honor an "always-fail" knob for testing the failure surface.
  switch (args.verificationCode.toUpperCase()) {
    case 'FAIL919X':
      return { ok: false, code: '919', msg: 'cardNo 與 cardEncrypt 不符', invoices: [] }
    case 'FAIL953X':
      return { ok: false, code: '953', msg: '系統忙線', invoices: [] }
    case 'FAIL998X':
      return { ok: false, code: '998', msg: 'appID 失效', invoices: [] }
  }

  const all = buildFixtureInvoices(args.barcode)
  const invoices = all.filter((inv) =>
    inv.invDate >= args.startDate && inv.invDate <= args.endDate,
  )
  return { ok: true, code: '200', msg: '查詢成功', invoices }
}

/**
 * Three scenarios coexist in the same fixture so consumers can test the diff
 * pipeline (作廢 / 折讓 沖銷) end-to-end:
 *
 *   1. AB10000001 — 開立 / 全家 / 55  (new, normal)
 *   2. AB10000002 — 開立 / 中油 / 1280 (new, normal)
 *   3. AB10000003 — 作廢 / 屈臣氏 / 480 (originally issued, later voided —
 *      InvoiceImportSnapshots will diff and mark for sweep)
 *   4. AB10000004 — 開立 / 全聯 / 700  (折讓 case: imported_amount in snapshot
 *      starts at 1000 in the test seed; 折讓 -300 leaves 700 here)
 *   5. AB10000005 — 開立 / 屈臣氏 / 320 (new, normal — extra)
 *
 * Dates are pinned to early/mid current-month so fetch range filters work
 * predictably from tests without the fixture going stale every month.
 */
export function buildFixtureInvoices(barcode: string): MofInvoiceHeader[] {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const monthPrefix = `${yyyy}-${mm}`

  return [
    {
      invNum: 'AB10000001',
      invDate: `${monthPrefix}-05`,
      sellerName: '全家便利商店股份有限公司',
      amount: '55',
      invStatus: '開立',
      invDonatable: 'N',
      cardType: '3J0002',
      cardNo: barcode,
    },
    {
      invNum: 'AB10000002',
      invDate: `${monthPrefix}-08`,
      sellerName: '台灣中油股份有限公司',
      amount: '1280',
      invStatus: '開立',
      invDonatable: 'N',
      cardType: '3J0002',
      cardNo: barcode,
    },
    {
      invNum: 'AB10000003',
      invDate: `${monthPrefix}-10`,
      sellerName: '屈臣氏個人用品商店股份有限公司',
      amount: '480',
      invStatus: '作廢',
      invDonatable: 'N',
      cardType: '3J0002',
      cardNo: barcode,
    },
    {
      invNum: 'AB10000004',
      invDate: `${monthPrefix}-12`,
      sellerName: '全聯實業股份有限公司',
      amount: '700',
      invStatus: '開立',
      invDonatable: 'N',
      cardType: '3J0002',
      cardNo: barcode,
    },
    {
      invNum: 'AB10000005',
      invDate: `${monthPrefix}-15`,
      sellerName: '屈臣氏個人用品商店股份有限公司',
      amount: '320',
      invStatus: '開立',
      invDonatable: 'N',
      cardType: '3J0002',
      cardNo: barcode,
    },
  ]
}
