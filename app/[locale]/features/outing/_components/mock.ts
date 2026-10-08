import type { Locale } from '@/lib/i18n/locales-meta'
import { splitEqual } from '@/lib/outing/split'
import { computeOutingNets, type OutingExpenseInput } from '@/lib/outing/balance'
import { minimalTransfers, type Transfer } from '@/lib/outing/settle'

/**
 * The one example the walkthrough on /features/outing shows (#1633), per
 * locale. Names and money live here, not in the dictionary, because the page
 * does arithmetic on them: shares, nets and the settlement list come out of
 * the product's own functions (lib/outing/*), and
 * tests/feature-outing-mock.test.ts checks every locale's example against
 * them. A hand-typed amount that drifts from what the app would compute is
 * silent: the page still renders, it just teaches the wrong sum.
 *
 * The page deliberately shows no amount for the couple's fold-back (#1634).
 * `members` are the two ledger members; the other two are friends.
 */
export interface OutingMockDef {
  outingName: string
  /** Placed before the number, e.g. `NT$`. */
  currencyPrefix: string
  /** Display names keyed by participant id. */
  names: Record<string, string>
  /** The two ledger members (you and your partner). */
  members: readonly [string, string]
  /** Everyone, in display order. All expenses are split across all of them. */
  participantIds: readonly string[]
  expenses: readonly { id: string; label: string; amount: number; paidBy: string }[]
}

export const OUTING_MOCK: Record<Locale, OutingMockDef> = {
  'zh-TW': {
    outingName: '墾丁三天兩夜',
    currencyPrefix: 'NT$',
    names: { p1: '你', p2: '阿青', p3: '小安', p4: '阿哲' },
    members: ['p1', 'p2'],
    participantIds: ['p1', 'p2', 'p3', 'p4'],
    expenses: [
      { id: 'e1', label: '民宿', amount: 8000, paidBy: 'p1' },
      { id: 'e2', label: '烤肉和食材', amount: 4000, paidBy: 'p2' },
      { id: 'e3', label: '油錢', amount: 800, paidBy: 'p3' },
    ],
  },
  'zh-CN': {
    outingName: '三亚四天三夜',
    currencyPrefix: '¥',
    names: { p1: '你', p2: '小青', p3: '小安', p4: '阿哲' },
    members: ['p1', 'p2'],
    participantIds: ['p1', 'p2', 'p3', 'p4'],
    expenses: [
      { id: 'e1', label: '民宿', amount: 2400, paidBy: 'p1' },
      { id: 'e2', label: '烧烤和食材', amount: 1200, paidBy: 'p2' },
      { id: 'e3', label: '油费', amount: 240, paidBy: 'p3' },
    ],
  },
  en: {
    outingName: 'Lake weekend',
    currencyPrefix: '$',
    names: { p1: 'You', p2: 'Maya', p3: 'Sam', p4: 'Leo' },
    members: ['p1', 'p2'],
    participantIds: ['p1', 'p2', 'p3', 'p4'],
    expenses: [
      { id: 'e1', label: 'Cabin', amount: 800, paidBy: 'p1' },
      { id: 'e2', label: 'Groceries and BBQ', amount: 400, paidBy: 'p2' },
      { id: 'e3', label: 'Gas', amount: 80, paidBy: 'p3' },
    ],
  },
  ja: {
    outingName: '箱根 一泊二日',
    currencyPrefix: '¥',
    names: { p1: 'あなた', p2: 'あおい', p3: 'さくら', p4: 'はると' },
    members: ['p1', 'p2'],
    participantIds: ['p1', 'p2', 'p3', 'p4'],
    expenses: [
      { id: 'e1', label: '宿', amount: 32000, paidBy: 'p1' },
      { id: 'e2', label: '食材とバーベキュー', amount: 16000, paidBy: 'p2' },
      { id: 'e3', label: 'ガソリン', amount: 3200, paidBy: 'p3' },
    ],
  },
}

export interface OutingMockResult {
  expenses: OutingExpenseInput[]
  /** Net per participant, creditor-positive. */
  nets: Map<string, number>
  /** Exactly what the in-outing "who pays whom" suggestion produces. */
  transfers: Transfer[]
}

/** Run an example through the product's own split / net / suggestion functions. */
export function deriveOutingMock(def: OutingMockDef): OutingMockResult {
  const ids = [...def.participantIds]
  const expenses: OutingExpenseInput[] = def.expenses.map((e) => ({
    paidByParticipantId: e.paidBy,
    amount: e.amount,
    shares: splitEqual(e.amount, ids),
  }))
  const nets = computeOutingNets(ids, expenses, [])
  return { expenses, nets, transfers: minimalTransfers(nets) }
}

/** `NT$8,000`. Manual grouping so server and client render the same bytes in every runtime. */
export function formatMockAmount(def: OutingMockDef, amount: number): string {
  return `${def.currencyPrefix}${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}
