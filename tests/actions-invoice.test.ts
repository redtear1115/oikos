import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  createInvoiceCredential,
  renameInvoiceCredential,
  refreshInvoiceCredential,
  deleteInvoiceCredential,
  listInvoiceCredentialsForViewer,
} from '@/actions/invoice'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

// ─── createInvoiceCredential ────────────────────────────────────────────────
describe('createInvoiceCredential', () => {
  it('encrypts the verification code and inserts a new row', async () => {
    queueDbResult([GROUP])              // viewer group lookup
    queueDbResult([])                   // existing-row check returns empty
    queueDbResult([{ id: 'cred-1' }])   // insert returning

    const out = await createInvoiceCredential({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
      nickname: '我的',
    })

    expect(out).toEqual({ id: 'cred-1' })
    expect(mockDb.insert).toHaveBeenCalled()
    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.groupId).toBe(GROUP.id)
    expect(values.userId).toBe(VIEWER.id)
    expect(values.barcode).toBe('/AB12CD3')
    expect(values.nickname).toBe('我的')
    expect(values.status).toBe('active')
    // Verification code should be ciphertext, not plaintext.
    expect(values.verificationCodeEncrypted).not.toBe('A1B2C3D4')
    // AES-GCM ciphertext format: ivHex:tagHex:cipherHex
    expect(values.verificationCodeEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
  })

  it('uppercases lowercase barcode + verification code', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    queueDbResult([{ id: 'cred-2' }])

    await createInvoiceCredential({
      barcode: '/ab12cd3',
      verificationCode: 'a1b2c3d4',
      nickname: null,
    })

    const values = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(values.barcode).toBe('/AB12CD3')
  })

  it('rejects malformed barcode (missing leading slash)', async () => {
    queueDbResult([GROUP])
    await expect(createInvoiceCredential({
      barcode: 'AB12CD34',  // 8 chars but no slash
      verificationCode: 'A1B2C3D4',
    })).rejects.toThrow(/條碼格式/)
  })

  it('rejects barcode with wrong length', async () => {
    queueDbResult([GROUP])
    await expect(createInvoiceCredential({
      barcode: '/SHORT',
      verificationCode: 'A1B2C3D4',
    })).rejects.toThrow(/條碼格式/)
  })

  it('rejects verification code with wrong length', async () => {
    queueDbResult([GROUP])
    await expect(createInvoiceCredential({
      barcode: '/AB12CD3',
      verificationCode: '1234567',  // 7 chars
    })).rejects.toThrow(/驗證碼/)
  })

  it('rejects duplicate active barcode for same user', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'existing-1' }])  // existing row found

    await expect(createInvoiceCredential({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
    })).rejects.toThrow(/已綁定/)
  })

  it('surfaces 919 from API as user-readable error', async () => {
    queueDbResult([GROUP])
    queueDbResult([])

    // FAIL919X is the mock fixture's trigger code for HTTP 919.
    await expect(createInvoiceCredential({
      barcode: '/AB12CD3',
      verificationCode: 'FAIL919X',
    })).rejects.toThrow(/條碼或驗證碼/)
  })

  it('surfaces 998 (system busy) as a soft retry message', async () => {
    queueDbResult([GROUP])
    queueDbResult([])

    await expect(createInvoiceCredential({
      barcode: '/AB12CD3',
      verificationCode: 'FAIL998X',
    })).rejects.toThrow(/服務暫時無法使用/)
  })

  it('rejects when viewer has no group', async () => {
    queueDbResult([])  // group lookup empty

    await expect(createInvoiceCredential({
      barcode: '/AB12CD3',
      verificationCode: 'A1B2C3D4',
    })).rejects.toThrow(/家計簿/)
  })
})

// ─── renameInvoiceCredential ───────────────────────────────────────────────
describe('renameInvoiceCredential', () => {
  it('updates only the nickname', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'cred-1' }])  // update returning

    await renameInvoiceCredential('cred-1', '老婆的')

    expect(mockDb.update).toHaveBeenCalled()
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.nickname).toBe('老婆的')
    // Nothing else should be set.
    expect(Object.keys(setCall)).toEqual(['nickname'])
  })

  it('accepts null to clear nickname', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'cred-1' }])
    await renameInvoiceCredential('cred-1', null)
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.nickname).toBeNull()
  })

  it('throws when row not found / belongs to another user', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // no row updated

    await expect(renameInvoiceCredential('cred-x', '別人的')).rejects.toThrow(/找不到/)
  })

  it('rejects nickname over 16 chars', async () => {
    queueDbResult([GROUP])
    await expect(
      renameInvoiceCredential('cred-1', '這個暱稱真的有夠長到超過十六個字符限制'),
    ).rejects.toThrow(/暱稱最長/)
  })
})

// ─── refreshInvoiceCredential ──────────────────────────────────────────────
describe('refreshInvoiceCredential', () => {
  it('soft-deletes the old row and inserts a new one with new ciphertext', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'cred-1', barcode: '/AB12CD3', nickname: '我的', lastSyncedAt: null,
    }])  // existing row lookup
    queueDbResult([{ id: 'cred-1' }])  // soft-delete returning (inside tx)
    queueDbResult([{ id: 'cred-2' }])  // insert returning (inside tx)

    const out = await refreshInvoiceCredential('cred-1', 'NEWCODEZ')

    expect(out).toEqual({ id: 'cred-2' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
    expect(mockDb.update).toHaveBeenCalled()  // soft-delete
    expect(mockDb.insert).toHaveBeenCalled()  // new row

    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.deletedAt).toBeInstanceOf(Date)

    const newValues = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(newValues.barcode).toBe('/AB12CD3')
    expect(newValues.nickname).toBe('我的')
    expect(newValues.verificationCodeEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/)
  })

  it('throws when row not in viewer group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // existing row not found

    await expect(
      refreshInvoiceCredential('cred-x', 'NEWCODEZ'),
    ).rejects.toThrow(/找不到/)
  })

  it('rejects when API returns 919 (verification code wrong)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'cred-1', barcode: '/AB12CD3', nickname: null, lastSyncedAt: null,
    }])

    await expect(
      refreshInvoiceCredential('cred-1', 'FAIL919X'),
    ).rejects.toThrow(/條碼或驗證碼/)
  })

  it('rejects malformed new verification code before hitting API', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      id: 'cred-1', barcode: '/AB12CD3', nickname: null, lastSyncedAt: null,
    }])

    await expect(
      refreshInvoiceCredential('cred-1', 'BAD'),  // too short
    ).rejects.toThrow(/驗證碼/)
  })
})

// ─── deleteInvoiceCredential ───────────────────────────────────────────────
describe('deleteInvoiceCredential', () => {
  it('soft-deletes the row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'cred-1' }])

    await deleteInvoiceCredential('cred-1')

    expect(mockDb.update).toHaveBeenCalled()
    const setCall = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(setCall.deletedAt).toBeInstanceOf(Date)
  })

  it('throws when row not in viewer group (cross-group safety)', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // no row

    await expect(deleteInvoiceCredential('cred-other-group')).rejects.toThrow(/找不到/)
  })
})

// ─── listInvoiceCredentialsForViewer ───────────────────────────────────────
describe('listInvoiceCredentialsForViewer', () => {
  it('returns rows scoped to viewer + group only', async () => {
    queueDbResult([GROUP])
    queueDbResult([
      { id: 'c1', barcode: '/AB12CD3', nickname: '我的', status: 'active', lastSyncedAt: null, createdAt: new Date() },
    ])

    const rows = await listInvoiceCredentialsForViewer()
    expect(rows).toHaveLength(1)
    expect(rows[0].barcode).toBe('/AB12CD3')
    expect(mockDb.select).toHaveBeenCalled()
  })
})
