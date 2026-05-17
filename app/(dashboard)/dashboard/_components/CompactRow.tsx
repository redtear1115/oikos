'use client'

import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CategoryChip } from '@/app/(dashboard)/_components/CategoryChip'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatDateRelative } from '@/lib/format-date'
import { formatAmount, type CurrencyCode } from '@/lib/currency'

// Beyond 1億 the full number overflows the row on mobile widths.
// Abbreviate to TW-familiar units (億 / 兆) so the row stays scannable;
// tapping the row reveals the exact amount in the detail sheet.
// TODO(v0.17 currency): truncation is TWD-specific; move to lib/currency
// when other currencies need abbreviation. For now NT$ is concatenated outside.
function formatRowAmount(amount: number, trillion: string, hundredMillion: string): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000_000_000) {
    return `${sign}${(abs / 1_000_000_000_000).toFixed(1)}${trillion}`
  }
  if (abs >= 100_000_000) {
    return `${sign}${(abs / 100_000_000).toFixed(1)}${hundredMillion}`
  }
  return amount.toLocaleString('en-US')
}

export interface CompactRowProps {
  tx: {
    id: string
    amount: number
    splitType: 'all_mine' | 'all_theirs' | 'half' | 'weighted' | null
    splitRatioA: number | null
    description: string
    category: string
    paidBy: string
    transactedAt: string
    kind: 'transaction' | 'settlement' | 'income'
    notes?: string | null
    status?: 'settled' | 'pending'
    originalCurrency?: string | null
    originalAmount?: number | null
  }
  isLast: boolean
  onClick?: () => void
  /** The group's base currency. Used for dual-currency display when originalCurrency differs. Defaults to 'twd'. */
  baseCurrency?: CurrencyCode
}

export function CompactRow({ tx, isLast, onClick, baseCurrency = 'twd' }: CompactRowProps) {
  const t = useTranslations()
  const locale = useLocale()
  const { viewer, partner, viewerIsA } = useMember()
  const payerIsViewer = tx.paidBy === viewer.id
  const payerRole = whoToMemberRole(payerIsViewer ? 'M' : 'T', viewerIsA)
  const payerInitial = payerIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const payerAvatar = payerIsViewer ? viewer.avatarUrl : (partner?.avatarUrl ?? null)
  const partnerName = partner?.displayName ?? t.common.partner
  const payerLabel = tx.kind === 'settlement'
    ? (payerIsViewer ? t.compactRow.iSettled : t.compactRow.partnerSettled.replace('{name}', partnerName))
    : tx.kind === 'income'
    ? (payerIsViewer ? t.compactRow.youIncome : t.compactRow.partnerIncome.replace('{name}', partnerName))
    : (payerIsViewer ? t.compactRow.youPaid : t.compactRow.partnerPaid.replace('{name}', partnerName))

  // Viewer's share of this row, surfaced as a small colored sub-number under
  // the total. Settlements don't have a split (they're cash transfers), so 0.
  let delta = 0
  if (tx.kind === 'transaction') {
    if (tx.splitType === 'all_theirs') {
      delta = payerIsViewer ? +tx.amount : -tx.amount
    } else if (tx.splitType === 'half') {
      delta = payerIsViewer ? +Math.ceil(tx.amount / 2) : -Math.ceil(tx.amount / 2)
    } else if (tx.splitType === 'weighted' && tx.splitRatioA != null) {
      const ratioA = tx.splitRatioA
      const otherShare = 100 - ratioA
      delta = payerIsViewer
        ? +Math.ceil(tx.amount * otherShare / 100)
        : -Math.ceil(tx.amount * ratioA / 100)
    }
  }
  const myShare = tx.kind === 'transaction'
    ? (payerIsViewer ? tx.amount - delta : -delta)
    : 0
  const showMyShare = tx.kind === 'transaction' && myShare !== 0
  const myShareColor = tx.kind === 'income' ? 'var(--credit)' : 'var(--debit)'

  // For income rows, fall back to category label when source/description is empty.
  const displayLabel = tx.kind === 'income'
    ? (tx.description || getIncomeCategory(tx.category).label)
    : tx.description

  const dateLabel = formatDateRelative(tx.transactedAt, locale)

  const noteText = tx.notes?.trim() || null
  const isPending = tx.kind === 'transaction' && tx.status === 'pending'

  const inner = (
    <>
      <CategoryChip categoryId={tx.category} size={32} />
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium mb-0.5 flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
          <span className="truncate">{displayLabel}</span>
          {isPending && (
            <span
              className="text-[10px] tracking-[0.4px] px-1.5 py-px rounded-full shrink-0"
              style={{
                background: 'var(--hairline)',
                color: 'var(--ink-2)',
              }}
            >
              {t.compactRow.pendingBadge}
            </span>
          )}
        </div>
        <div
          className="text-micro flex items-center gap-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {dateLabel} · <Avatar memberRole={payerRole} initial={payerInitial} src={payerAvatar} size={16} /> {payerLabel}
        </div>
        {noteText && (
          <div
            className="text-micro mt-1 italic line-clamp-2 break-words"
            style={{ color: 'var(--ink-2)' }}
          >
            “{noteText}”
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {tx.originalCurrency && tx.originalAmount != null ? (
          // Foreign-currency row: show original amount on top, base equivalent below.
          // `originalCurrency` is free-text from trip-multi-currency (e.g. 'vnd' / 'eur')
          // — formatAmount already accepts any string and falls back to "${CODE} ${amount}"
          // for unknown codes, so no enum narrowing needed here.
          <>
            <div
              className="tnum text-sm font-medium tracking-[-0.2px]"
              style={{ fontFamily: 'var(--font-numeric)', color: 'var(--ink)' }}
            >
              {formatAmount(tx.originalAmount, tx.originalCurrency)}
            </div>
            <div
              className="tnum text-micro mt-px"
              style={{ color: 'var(--ink-3)' }}
            >
              ≈ {formatAmount(tx.amount, baseCurrency)}
            </div>
          </>
        ) : (
          <div
            className="tnum text-sm font-medium tracking-[-0.2px]"
            style={{ fontFamily: 'var(--font-numeric)', color: 'var(--ink)' }}
          >
            NT${formatRowAmount(tx.amount, t.compactRow.trillion, t.compactRow.hundredMillion)}
          </div>
        )}
        {showMyShare && (
          <div className="tnum text-micro mt-px" style={{ color: myShareColor }}>
            ${myShare.toLocaleString('en-US')}
          </div>
        )}
      </div>
    </>
  )

  const cls = "w-full flex items-center gap-3 px-[14px] py-3 text-left bg-transparent border-0"
  // Pending records read as "still in motion" — drop opacity so they recede
  // visually next to settled rows. Badge label still reads at full contrast.
  const style = {
    borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
    opacity: isPending ? 0.6 : 1,
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} cursor-pointer transition-colors duration-100 hover:bg-[rgba(31,27,22,0.03)]`} style={style}>
        {inner}
      </button>
    )
  }

  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  )
}
