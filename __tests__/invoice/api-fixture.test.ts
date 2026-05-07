import { describe, it, expect } from 'vitest'
import {
  fetchInvoicesByCarrier,
  buildFixtureInvoices,
  isMockMode,
  type InvStatus,
} from '@/lib/invoice/api'

const VALID_BARCODE = '/AB12CD3'
const VALID_CODE = 'TESTCODE'

describe('isMockMode', () => {
  it('returns true when no APP_ID and no force flag', () => {
    const prev = process.env.MOF_INVOICE_APP_ID
    const force = process.env.INVOICE_MOCK_MODE
    delete process.env.MOF_INVOICE_APP_ID
    delete process.env.INVOICE_MOCK_MODE
    try {
      expect(isMockMode()).toBe(true)
    } finally {
      if (prev !== undefined) process.env.MOF_INVOICE_APP_ID = prev
      if (force !== undefined) process.env.INVOICE_MOCK_MODE = force
    }
  })

  it('respects INVOICE_MOCK_MODE=1 even when APP_ID is set', () => {
    const prev = process.env.MOF_INVOICE_APP_ID
    const force = process.env.INVOICE_MOCK_MODE
    process.env.MOF_INVOICE_APP_ID = 'fake-app-id'
    process.env.INVOICE_MOCK_MODE = '1'
    try {
      expect(isMockMode()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.MOF_INVOICE_APP_ID
      else process.env.MOF_INVOICE_APP_ID = prev
      if (force === undefined) delete process.env.INVOICE_MOCK_MODE
      else process.env.INVOICE_MOCK_MODE = force
    }
  })
})

describe('buildFixtureInvoices — 三場景 coverage', () => {
  it('contains at least one issued (開立) invoice', () => {
    const list = buildFixtureInvoices(VALID_BARCODE)
    const issued = list.filter((inv) => inv.invStatus === '開立')
    expect(issued.length).toBeGreaterThan(0)
  })

  it('contains at least one voided (作廢) invoice', () => {
    const list = buildFixtureInvoices(VALID_BARCODE)
    const voided = list.filter((inv) => inv.invStatus === '作廢')
    expect(voided.length).toBeGreaterThan(0)
  })

  it('exposes a 折讓 candidate (issued + amount that snapshot can diff against)', () => {
    // The fixture intentionally returns AB10000004 with amount 700; the snapshot
    // seed (in the diff layer's own tests) starts at 1000, so the diff yields
    // a 折讓 of -300. This test just asserts the fixture exposes the row.
    const list = buildFixtureInvoices(VALID_BARCODE)
    const target = list.find((inv) => inv.invNum === 'AB10000004')
    expect(target).toBeDefined()
    expect(target!.invStatus).toBe<InvStatus>('開立')
    expect(target!.amount).toBe('700')
  })

  it('all rows carry the requested barcode (mock mirrors caller cardNo)', () => {
    const list = buildFixtureInvoices(VALID_BARCODE)
    expect(list.every((inv) => inv.cardNo === VALID_BARCODE)).toBe(true)
    expect(list.every((inv) => inv.cardType === '3J0002')).toBe(true)
  })
})

describe('fetchInvoicesByCarrier — mock mode', () => {
  it('returns ok=true with invoices in the requested date range', async () => {
    const now = new Date()
    const yyyy = now.getUTCFullYear()
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
    const start = `${yyyy}-${mm}-01`
    const end = `${yyyy}-${mm}-28`

    const result = await fetchInvoicesByCarrier({
      barcode: VALID_BARCODE,
      verificationCode: VALID_CODE,
      startDate: start,
      endDate: end,
    })

    expect(result.ok).toBe(true)
    expect(result.code).toBe('200')
    expect(result.invoices.length).toBeGreaterThan(0)
    for (const inv of result.invoices) {
      expect(inv.invDate >= start).toBe(true)
      expect(inv.invDate <= end).toBe(true)
    }
  })

  it('filters out invoices outside the requested range', async () => {
    const result = await fetchInvoicesByCarrier({
      barcode: VALID_BARCODE,
      verificationCode: VALID_CODE,
      startDate: '1990-01-01',
      endDate: '1990-01-31',
    })
    expect(result.ok).toBe(true)
    expect(result.invoices).toEqual([])
  })

  it('returns 919 when verificationCode is FAIL919X (auth failure)', async () => {
    const result = await fetchInvoicesByCarrier({
      barcode: VALID_BARCODE,
      verificationCode: 'FAIL919X',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('919')
  })

  it('returns 953 when verificationCode is FAIL953X (system busy)', async () => {
    const result = await fetchInvoicesByCarrier({
      barcode: VALID_BARCODE,
      verificationCode: 'FAIL953X',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('953')
  })

  it('returns 998 when verificationCode is FAIL998X (appID invalid)', async () => {
    const result = await fetchInvoicesByCarrier({
      barcode: VALID_BARCODE,
      verificationCode: 'FAIL998X',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('998')
  })
})
