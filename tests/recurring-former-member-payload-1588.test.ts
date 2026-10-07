// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// #1588 — recurring rules and pending cards whose 收入歸屬 / 付款人 left the
// ledger. Three pages hand those rows to client components:
//   A  /assets/[savings policy]  → SavingsView recurringRules
//   B  /settings/recurring       → incomeRules / expenseRules (both tabs)
//   C  /dashboard                → pendings / expensePendings
// None of them may put the ex-partner's profile id into the payload.
//
//   chapter 1  A + B   closed, epoch e1 — B removed (removePartner)
//   chapter 2  A + D   open,   epoch e2 — D joined later (re-pair)
//   DUO group row:  member_a A, member_b D
//   SOLO group row: member_a A, member_b null (B removed, nobody new)
//
// Failure looks like nothing: the pages render, the RSC payload carries B's
// uuid (plus B's salary amount and source) to A's — and D's — browser, and
// the UI labels B's rules with D's name.
//
// The real sanitiser (lib/recurringMemberLink.ts), the real page readers
// (lib/db/queries/recurringView.ts) and the real scope loader run here; only
// the raw DB reads are mocked.

const EX = 'b0b0b0b0-ex00-4000-8000-0000000000b0'        // B, removed
const ME = 'a0a0a0a0-me00-4000-8000-0000000000a0'        // A
const NEW = 'd0d0d0d0-new0-4000-8000-0000000000d0'       // D, joined after B left

const CH1 = { startedAt: new Date('2026-01-01T00:00:00Z'), endedAt: new Date('2026-06-01T00:00:00Z'), epochId: 'e1', isPast: true }
const CH2 = { startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: null, epochId: 'e2', isPast: false }
const DUO = { id: 'g1', memberA: ME, memberB: NEW as string | null, guardianBetaEnabled: true, defaultSplitRatioA: null, baseCurrency: 'twd' }
const SOLO = { ...DUO, memberB: null as string | null }
const OLD = new Date('2026-02-01T00:00:00Z')

const rule = (id: string, person: string) => ({
  id, amount: 50000, category: 'salary', assetId: 'ins-savings', intervalMonths: 1, dayOfMonth: 5,
  startsOn: '2026-01-05', endsOn: null, nextOccurrenceAt: '2026-11-05', pausedAt: null,
  recipientId: person, source: `src ${id}`,
})
const INCOME_RULES = [rule('ri-ex', EX), rule('ri-me', ME), rule('ri-new', NEW)]
const EXPENSE_RULES = INCOME_RULES.map(({ recipientId, source: _s, ...r }) => ({
  ...r, id: r.id.replace('ri', 're'), paidBy: recipientId, splitType: 'half', splitRatioA: null, description: 'rent', category: 'housing',
}))
const INCOME_PENDINGS = INCOME_RULES.map((r) => ({
  id: `p-${r.id}`, ruleId: r.id, proposedAmount: r.amount, proposedDate: '2026-10-05', category: r.category,
  source: r.source, recipientId: r.recipientId, assetId: null,
}))
const EXPENSE_PENDINGS = EXPENSE_RULES.map((r) => ({
  id: `p-${r.id}`, ruleId: r.id, proposedAmount: r.amount, proposedDate: '2026-10-05', proposedDescription: r.description,
  proposedPaidBy: r.paidBy, proposedSplitType: 'half', proposedSplitRatioA: null, category: r.category, assetId: null,
}))
/** A money row from chapter 1 — chapter history, out of scope: stays as is. */
const EX_INCOME_RECORD = {
  id: 'inc-ch1', amount: 1, category: 'salary', source: null, recipientId: EX, assetId: null,
  occurredAt: '2026-03-05', createdAt: new Date('2026-03-05T00:00:00Z'),
}

const SAVINGS_ASSET = {
  id: 'ins-savings', type: 'insurance', name: 'policy', groupId: 'g1', notes: null, templateKey: null, templateFields: null,
  deletedAt: null, frozenAt: null, plateEncrypted: null, createdAt: OLD,
  insuranceType: 'savings', insuranceInsured: null, insuranceInsuredChildId: null, insuranceInsuredChildName: null,
  insuranceInsuredUserId: null, insuranceInsuredUserDisplayName: null, insurancePolicyHolderUserId: ME,
  insurancePolicyHolderDisplayName: 'Me', insurancePolicyHolderAvatarUrl: null,
  insuranceInsurer: 'Acme', insuranceAnnualPremium: 1000, insuranceSumInsured: null, insuranceStartsAt: null,
  insuranceExpiryDate: null, insuranceTermYears: 20, insurancePayCycle: 'annual', insuranceReminderDaysBefore: 30,
  insuranceVehicleId: null,
}

let viewer = ME
let group = DUO
let epochWindow: typeof CH1 | typeof CH2 = CH2

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`) },
}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: async () => ({ id: viewer }) }))
vi.mock('@/lib/auth/viewer', () => ({
  requireViewerGroupOrRedirect: async () => ({ user: { id: viewer }, group }),
}))
vi.mock('@/actions/income', () => ({ getInsuranceAssets: async () => ({ ok: true, data: [] }) }))
vi.mock('@/lib/db/queries/epoch', () => ({
  resolveViewerEpochContext: async () => ({ group, window: epochWindow }),
  getLatestPriorClosedEpoch: async () => null,
  getEpochMembers: vi.fn(async (id: string) => (id === 'e1' ? { memberAId: ME, memberBId: EX } : { memberAId: ME, memberBId: NEW })),
}))
vi.mock('@/lib/i18n/t', () => ({
  getTranslations: async () => ({
    assetListItem: { insuranceGroups: { shortTermProtection: 's', longTermProtection: 'l', savings: 'v' } },
    assetDetail: { switcher: { carGroup: 'c' } },
  }),
  getLocale: async () => 'zh-TW',
}))
vi.mock('@/lib/db/client', () => ({ db: {} }))
// Raw readers — the rows exactly as the tables hold them (B's id included).
vi.mock('@/lib/db/queries/recurringIncome', () => ({
  listActiveRules: async () => INCOME_RULES,
  listRulesForAsset: async () => INCOME_RULES,
  listActivePendings: async () => INCOME_PENDINGS,
}))
vi.mock('@/lib/db/queries/recurringExpense', () => ({
  listActiveRules: async () => EXPENSE_RULES,
  listActivePendings: async () => EXPENSE_PENDINGS,
}))
// /assets/[id]
vi.mock('@/lib/db/queries/asset', () => ({
  listAssetsForGroup: async () => [SAVINGS_ASSET],
  getAssetById: async (id: string) => (id === SAVINGS_ASSET.id ? SAVINGS_ASSET : null),
  getAssetSummary: async () => ({ monthAmount: 0, totalAmount: 0 }),
  listTransactionsPagedForAsset: async () => [],
}))
vi.mock('@/lib/db/queries/insurance', () => ({
  getInsurancePaymentTotal: async () => ({ total: 0, count: 0 }),
  getInsuranceReturnTotal: async () => ({ total: 0, count: 0 }),
  getInsuranceReturnTotalsByCategory: async () => new Map(),
  listInsurancePaymentsPaged: async () => [],
  listInsuranceReturnsPaged: async () => [],
}))
vi.mock('@/lib/db/queries/fuelLog', () => ({ listFuelLogsWithPrev: async () => [], fuelStatsForAsset: async () => ({}) }))
vi.mock('@/lib/db/queries/aibutsu', () => ({
  getInsuranceDetails: async () => ({
    policyNo: null, kind: 'savings', insured: null, insuredChildId: null, insuredChildName: null,
    insuredUserId: null, insuredUserDisplayName: null, policyHolderUserId: ME, insurer: 'Acme', annualPremium: 1000,
    payCycle: 'annual', startsAt: '2026-01-01', endsAt: '2046-01-01', termYears: 20, sumInsured: null, vehicleId: null,
    expectedMaturityAmount: null, accountValue: null,
  }),
  getLinkedInsurancesForVehicle: async () => [],
}))
// /dashboard
vi.mock('@/lib/db/queries/balance', () => ({ getGroupBalance: async () => 0, getGroupPendingBalanceDelta: async () => 0 }))
vi.mock('@/lib/db/queries/transactions', () => ({ listTransactionsPaged: async () => [], monthlyStatsByCategory: async () => [] }))
vi.mock('@/lib/db/queries/incomes', () => ({
  listIncomeMonthSummary: async () => ({ total: 0, count: 0 }),
  listIncomesPaged: async (_g: string, _c: unknown, limit: number) => (limit === 1 ? [] : [EX_INCOME_RECORD]),
}))
vi.mock('@/lib/db/queries/trips', () => ({ listActiveTrips: async () => [] }))
vi.mock('@/lib/db/queries/currencyRates', () => ({ listRatesForGroup: async () => [] }))
vi.mock('@/lib/db/queries/monthlyReview', () => ({
  loadMonthlyReviewSnapshot: async () => null,
  listMonthlyReviewMonths: async () => [],
  loadMonthlyReviewMessages: async () => [],
}))
vi.mock('@/lib/today-server', () => ({ getTodayYMD: async () => '2026-10-07' }))
vi.mock('@/app/(dashboard)/dashboard/_components/Dashboard', () => ({ Dashboard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/PartnerLeftCard', () => ({ PartnerLeftCard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/WelcomeSoloCard', () => ({ WelcomeSoloCard: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/MonthlyReviewBanner', () => ({ MonthlyReviewBanner: () => null }))

const { default: AssetDetailPage } = await import('@/app/(dashboard)/assets/[id]/page')
const { default: RecurringSettingsPage } = await import('@/app/(dashboard)/settings/recurring/page')
const { default: DashboardPage } = await import('@/app/(dashboard)/dashboard/page')

type Row = Record<string, unknown> & { id: string }
/** Everything the server component hands to the client, as it would be serialised. */
const wire = (v: unknown) => JSON.stringify(v)

async function savingsRules(): Promise<{ props: Record<string, unknown>; rules: Row[] }> {
  const el = (await AssetDetailPage({ params: Promise.resolve({ id: SAVINGS_ASSET.id }) })) as ReactElement<Record<string, unknown>>
  return { props: el.props, rules: el.props.recurringRules as Row[] }
}
async function settings(): Promise<{ props: Record<string, unknown>; income: Row[]; expense: Row[] }> {
  const page = (await RecurringSettingsPage()) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>
  const props = page.props.children.props
  return { props, income: props.incomeRules as Row[], expense: props.expenseRules as Row[] }
}
async function dashboard(): Promise<{ props: Record<string, unknown>; income: Row[]; expense: Row[] }> {
  const frag = (await DashboardPage()) as ReactElement<{ children: unknown[] }>
  const kids = (frag.props.children as unknown[]).flat().filter(Boolean) as ReactElement<Record<string, unknown>>[]
  const dash = kids.find((k) => 'pendings' in (k.props ?? {}))!
  return { props: dash.props, income: dash.props.pendings as Row[], expense: dash.props.expensePendings as Row[] }
}
const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id)

beforeEach(() => { viewer = ME; group = DUO; epochWindow = CH2 })

for (const [label, g] of [['after removePartner, solo (A)', SOLO], ['after re-pair with D, duo (A + D)', DUO]] as const) {
  describe(`A, current member — ${label}; B's rules still point at B`, () => {
    beforeEach(() => { group = g })

    it('T1 — A /assets/[savings]: no trace of B; B\'s rule flagged former', async () => {
      const { props, rules } = await savingsRules()
      expect(wire(props)).not.toContain(EX)
      expect(byId(rules, 'ri-ex')).toMatchObject({ recipientId: null, recipientIsFormer: true, formerLabel: true })
      expect(byId(rules, 'ri-me')).toMatchObject({ recipientId: ME, recipientIsFormer: false })
    })

    it('T2 — B /settings/recurring (both tabs): no trace of B; former flags only on B\'s rules', async () => {
      const { props, income, expense } = await settings()
      expect(wire(props)).not.toContain(EX)
      expect(byId(income, 'ri-ex')).toMatchObject({ recipientId: null, recipientIsFormer: true, formerLabel: true })
      expect(byId(expense, 're-ex')).toMatchObject({ paidBy: null, paidByIsFormer: true, formerLabel: true })
      // T11 — no false flags on current members' rules.
      expect(byId(income, 'ri-me')).toMatchObject({ recipientId: ME, recipientIsFormer: false })
      expect(byId(expense, 're-me')).toMatchObject({ paidBy: ME, paidByIsFormer: false })
    })

    it('T3 — C /dashboard pending stacks: no trace of B; B\'s cards flagged former', async () => {
      const { props, income, expense } = await dashboard()
      expect(wire(props)).not.toContain(EX)
      expect(byId(income, 'p-ri-ex')).toMatchObject({ recipientId: null, recipientIsFormer: true, formerLabel: true })
      expect(byId(expense, 'p-re-ex')).toMatchObject({ proposedPaidBy: null, proposedPaidByIsFormer: true, formerLabel: true })
      expect(byId(income, 'p-ri-me')).toMatchObject({ recipientId: ME, recipientIsFormer: false })
      expect(byId(expense, 'p-re-me')).toMatchObject({ proposedPaidBy: ME, proposedPaidByIsFormer: false })
    })
  })
}

it('duo control: rules / cards of the current partner D keep D, flag false', async () => {
  const s = await settings()
  expect(byId(s.income, 'ri-new')).toMatchObject({ recipientId: NEW, recipientIsFormer: false })
  expect(byId(s.expense, 're-new')).toMatchObject({ paidBy: NEW, paidByIsFormer: false })
  const d = await dashboard()
  expect(byId(d.expense, 'p-re-new')).toMatchObject({ proposedPaidBy: NEW, proposedPaidByIsFormer: false })
})

it('solo: a rule of D (not a member of the solo group row) is dropped too', async () => {
  group = SOLO
  const s = await settings()
  expect(wire(s.props)).not.toContain(NEW)
})

describe('T4 — B, who was removed, pinned to chapter 1 (A + B); D joined after', () => {
  beforeEach(() => { viewer = EX; epochWindow = CH1; group = DUO })

  it('dashboard: D never reaches B, and nothing is labelled 前伴侶 (formerLabel false)', async () => {
    const { props, income, expense } = await dashboard()
    expect(wire(props)).not.toContain(NEW)
    expect(byId(income, 'p-ri-new')).toMatchObject({ recipientId: null, recipientIsFormer: true, formerLabel: false })
    expect(byId(expense, 'p-re-new')).toMatchObject({ proposedPaidBy: null, proposedPaidByIsFormer: true, formerLabel: false })
    // B still sees themself and A (the chapter's members).
    expect(byId(income, 'p-ri-ex')).toMatchObject({ recipientId: EX, recipientIsFormer: false })
    expect(byId(income, 'p-ri-me')).toMatchObject({ recipientId: ME, recipientIsFormer: false })
  })

  it('savings page: D never reaches B', async () => {
    const { props, rules } = await savingsRules()
    expect(wire(props)).not.toContain(NEW)
    expect(byId(rules, 'ri-new')).toMatchObject({ recipientId: null, recipientIsFormer: true, formerLabel: false })
  })
})

it("A pinned to chapter 1 (A + B): money rows still show B (chapter history is out of scope); pending cards don't", async () => {
  viewer = ME; epochWindow = CH1; group = DUO
  const { income } = await dashboard()
  expect(byId(income, 'p-ri-ex')).toMatchObject({ recipientId: null, recipientIsFormer: true })
  const frag = (await DashboardPage()) as ReactElement<{ children: unknown[] }>
  const kids = (frag.props.children as unknown[]).flat().filter(Boolean) as ReactElement<Record<string, unknown>>[]
  const dash = kids.find((k) => 'pendings' in (k.props ?? {}))!
  const feed = await (dash.props.feedDataPromise as Promise<{ recentIncomeFeed: Row[] }>)
  expect(wire(feed.recentIncomeFeed)).toContain(EX)
})

// Raw-row guard: the raw readers return the stored person id. Only the page
// readers in lib/db/queries/recurringView.ts may call them; a page, action or
// component that imports one directly would hand an ex-partner's uuid to the
// browser. (The view types cover the rest: client props need the required
// `*IsFormer` / `formerLabel` fields, so a raw row fails `tsc`.)
describe('only recurringView.ts reads raw rules / pending rows (#1588)', () => {
  it('no file under app/, actions/, components/ or lib/ imports the raw list readers', () => {
    const root = resolve(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) { walk(p); continue }
        if (!/\.(ts|tsx)$/.test(name)) continue
        const src = readFileSync(p, 'utf8')
        const importsRaw = /import\s*\{[^}]*\b(listActiveRules|listRulesForAsset|listActivePendings)\b[^}]*\}\s*from\s*'@\/lib\/db\/queries\/recurring(Income|Expense)'/.test(src)
        if (importsRaw) hits.push(p.slice(root.length + 1))
      }
    }
    for (const dir of ['app', 'actions', 'components', 'lib']) walk(join(root, dir))
    expect(hits).toEqual(['lib/db/queries/recurringView.ts'])
  })
})
