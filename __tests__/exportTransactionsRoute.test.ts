import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /api/export/transactions — which group it exports, whose chapters, and
// the audit event. Everything below the route is mocked: the group resolver,
// the export query, translations and analytics.

const USER_ID = '11111111-1111-4111-8111-111111111111'
const ACTIVE_GROUP_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_GROUP_ID = '33333333-3333-4333-8333-333333333333'

const getCurrentUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  getCurrentUser: () => getCurrentUser(),
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

const getActiveGroupForUser = vi.fn()
vi.mock('@/lib/db/queries/group', () => ({
  getActiveGroupForUser: (userId: string) => getActiveGroupForUser(userId),
}))

// A direct `OikosGroups` lookup would see this: an arbitrary group of the
// user's, not the one the rest of the app treats as active.
vi.mock('@/lib/db/client', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => [{ id: OTHER_GROUP_ID }],
  }
  return { db: chain }
})

const listAllActiveCashTransactionsForExport = vi.fn()
vi.mock('@/lib/db/queries/transactions', () => ({
  listAllActiveCashTransactionsForExport: (...args: unknown[]) =>
    listAllActiveCashTransactionsForExport(...args),
}))

vi.mock('@/lib/i18n/t', async () => {
  const { en } = await import('@/lib/i18n/locales/en')
  return { getTranslations: async () => en }
})

const captureServer = vi.fn()
vi.mock('@/lib/analytics/server', () => ({
  captureServer: (...args: unknown[]) => captureServer(...args),
}))

const { GET } = await import('@/app/api/export/transactions/route')

const ROWS = [
  {
    transactedAt: new Date('2026-05-09T00:00:00Z'),
    description: 'coffee',
    amount: 120,
    category: 'dining',
    splitType: 'half' as const,
    paidByName: 'Ray',
    notes: null,
  },
  {
    transactedAt: new Date('2026-05-08T00:00:00Z'),
    description: '=1+1',
    amount: 80,
    category: 'dining',
    splitType: 'half' as const,
    paidByName: 'Pat',
    notes: null,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUser.mockResolvedValue({ id: USER_ID })
  getActiveGroupForUser.mockResolvedValue({ id: ACTIVE_GROUP_ID })
  listAllActiveCashTransactionsForExport.mockResolvedValue(ROWS)
  captureServer.mockResolvedValue(undefined)
})

describe('GET /api/export/transactions', () => {
  it('exports the group from getActiveGroupForUser, scoped to the viewer', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(getActiveGroupForUser).toHaveBeenCalledWith(USER_ID)
    expect(listAllActiveCashTransactionsForExport).toHaveBeenCalledTimes(1)
    expect(listAllActiveCashTransactionsForExport).toHaveBeenCalledWith(ACTIVE_GROUP_ID, USER_ID)
  })

  it('records a transactions_exported event with the group and row count', async () => {
    await GET()
    expect(captureServer).toHaveBeenCalledTimes(1)
    expect(captureServer).toHaveBeenCalledWith(USER_ID, 'transactions_exported', {
      group_id: ACTIVE_GROUP_ID,
      row_count: ROWS.length,
    })
  })

  it('returns a spreadsheet-safe CSV attachment', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename=".+\.csv"$/)
    const body = await res.text()
    expect(body).toContain(`"'=1+1"`)
    expect(body).not.toMatch(/,=1\+1,/)
  })

  it('401 without a user, no lookup and no event', async () => {
    getCurrentUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(getActiveGroupForUser).not.toHaveBeenCalled()
    expect(captureServer).not.toHaveBeenCalled()
  })

  it('404 when the user has no group, no event', async () => {
    getActiveGroupForUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
    expect(listAllActiveCashTransactionsForExport).not.toHaveBeenCalled()
    expect(captureServer).not.toHaveBeenCalled()
  })
})
