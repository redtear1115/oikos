import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseTxnRow,
  parseSettleRow,
  parseAssetRow,
  parseFuelLogRow,
  parseIncomeRow,
  parseBalanceUpdate,
} from '@/lib/realtime/payload-schema'

describe('realtime payload-schema parsers', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('parseTxnRow', () => {
    const valid = {
      id: 't1',
      groupId: 'g1',
      paidBy: 'u1',
      amount: 1000,
      splitType: 'half',
      splitRatioA: null,
      description: 'lunch',
      category: 'dining',
      notes: null,
      status: 'settled',
      transactedAt: '2026-05-15T12:00:00Z',
      createdAt: '2026-05-15T12:00:01Z',
      deletedAt: null,
      assetId: null,
    }

    it('parses a well-formed payload', () => {
      const out = parseTxnRow(valid)
      expect(out).not.toBeNull()
      expect(out?.id).toBe('t1')
      expect(out?.splitType).toBe('half')
    })

    it('strips extra realtime fields (originalCurrency, rateSnapshot) that consumers do not declare', () => {
      const withExtras = { ...valid, originalCurrency: 'jpy', originalAmount: 5000, rateSnapshot: '{}' }
      const out = parseTxnRow(withExtras)
      expect(out).not.toBeNull()
      // valibot v.object() drops extras — guard against regression to looseObject.
      expect(out as unknown as Record<string, unknown>).not.toHaveProperty('originalCurrency')
    })

    it('returns null for missing required field and warns', () => {
      const { amount: _amount, ...broken } = valid
      void _amount
      expect(parseTxnRow(broken)).toBeNull()
      expect(warnSpy).toHaveBeenCalledOnce()
    })

    it('returns null for invalid splitType', () => {
      expect(parseTxnRow({ ...valid, splitType: 'mystery' })).toBeNull()
    })

    it('returns null for invalid status', () => {
      expect(parseTxnRow({ ...valid, status: 'draft' })).toBeNull()
    })

    it('returns null for wrong amount type', () => {
      expect(parseTxnRow({ ...valid, amount: '1000' })).toBeNull()
    })

    it('returns null for non-object input', () => {
      expect(parseTxnRow(null)).toBeNull()
      expect(parseTxnRow(undefined)).toBeNull()
      expect(parseTxnRow('payload')).toBeNull()
    })
  })

  describe('parseSettleRow', () => {
    const valid = {
      id: 's1',
      groupId: 'g1',
      paidBy: 'u1',
      amount: 500,
      note: null,
      settledAt: '2026-05-15T12:00:00Z',
      createdAt: '2026-05-15T12:00:01Z',
      deletedAt: null,
    }

    it('parses a well-formed payload', () => {
      expect(parseSettleRow(valid)?.id).toBe('s1')
    })

    it('returns null when note has wrong type', () => {
      expect(parseSettleRow({ ...valid, note: 123 })).toBeNull()
    })
  })

  describe('parseAssetRow', () => {
    const valid = {
      id: 'a1',
      groupId: 'g1',
      type: 'car',
      name: 'Civic',
      createdAt: '2026-05-15T12:00:00Z',
      deletedAt: null,
    }

    it('parses a well-formed payload', () => {
      expect(parseAssetRow(valid)?.type).toBe('car')
    })

    it('accepts all asset types', () => {
      for (const type of ['car', 'house', 'child', 'insurance', 'pet', 'plant', 'item']) {
        expect(parseAssetRow({ ...valid, type })).not.toBeNull()
      }
    })

    it('rejects unknown asset type', () => {
      expect(parseAssetRow({ ...valid, type: 'spaceship' })).toBeNull()
    })
  })

  describe('parseFuelLogRow', () => {
    const valid = {
      id: 'f1',
      assetId: 'a1',
      // Postgres numeric is serialized by Realtime as a string
      liters: '42.5',
      fuelType: '95',
      odometer: 12345,
      station: 'Shell',
      loggedAt: '2026-05-15T12:00:00Z',
      createdAt: '2026-05-15T12:00:01Z',
      deletedAt: null,
    }

    it('parses a well-formed payload', () => {
      expect(parseFuelLogRow(valid)?.id).toBe('f1')
    })

    it('rejects electric fuelType (EV cars have no FuelLog)', () => {
      expect(parseFuelLogRow({ ...valid, fuelType: 'electric' })).toBeNull()
    })

    it('rejects numeric `liters` (Realtime sends as string)', () => {
      expect(parseFuelLogRow({ ...valid, liters: 42.5 })).toBeNull()
    })
  })

  describe('parseIncomeRow', () => {
    const valid = {
      id: 'i1',
      groupId: 'g1',
      recipientId: 'u1',
      amount: 50000,
      category: 'salary',
      source: 'Company',
      assetId: null,
      occurredAt: '2026-05-15',
      createdAt: '2026-05-15T12:00:00Z',
      deletedAt: null,
    }

    it('parses a well-formed payload', () => {
      expect(parseIncomeRow(valid)?.recipientId).toBe('u1')
    })

    it('allows null source / assetId', () => {
      expect(parseIncomeRow({ ...valid, source: null, assetId: null })).not.toBeNull()
    })
  })

  describe('parseBalanceUpdate', () => {
    it('parses a well-formed balance update', () => {
      expect(parseBalanceUpdate({ balance: 100, version: 5 })).toEqual({ balance: 100, version: 5 })
    })

    it('rejects missing version', () => {
      expect(parseBalanceUpdate({ balance: 100 })).toBeNull()
    })

    it('rejects string-encoded numbers', () => {
      expect(parseBalanceUpdate({ balance: '100', version: 5 })).toBeNull()
    })
  })
})
