'use client'

import { useBaseCurrency, useMember, useViewedPartner, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { CategoryChip } from '@/app/(dashboard)/_components/CategoryChip'
import { getIncomeCategory } from '@/lib/incomeCategories'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatDateRelative } from '@/lib/format-date'
import { useToday } from '@/app/(dashboard)/_components/TodayProvider'
import { currencySymbol, formatLedgerAmount } from '@/lib/currency'
import { toViewerShare } from '@/lib/splitRatio'
import { isOutingFoldNote } from '@/lib/outing/foldNote'

// Beyond 1億 the full number overflows the row on mobile widths.
// Abbreviate to TW-familiar units (億 / 兆) so the row stays scannable;
// tapping the row reveals the exact amount in the detail sheet.
// TODO(v0.17 currency): truncation is TWD-specific (億 / 兆); move to lib/currency
// when other currencies need abbreviation. The currency symbol is concatenated
// outside, from the ledger base currency (#1482).
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
}

export function CompactRow({ tx, isLast, onClick }: CompactRowProps) {
  const baseCurrency = useBaseCurrency()
  const t = useTranslations()
  const locale = useLocale()
  const today = useToday()
  const { viewer, viewerIsA } = useMember()
  // #1604 — the viewed chapter's partner: in a past chapter that is the ex
  // (name + initial, no avatar), never whoever the viewer is paired with today.
  const { partner } = useViewedPartner()
  const payerIsViewer = tx.paidBy === viewer.id
  const payerRole = whoToMemberRole(payerIsViewer ? 'M' : 'T', viewerIsA)
  const payerInitial = payerIsViewer ? viewer.initial : (partner?.initial ?? '?')
  const payerAvatar = payerIsViewer ? viewer.avatarUrl : (partner?.avatarUrl ?? null)
  const partnerName = partner?.displayName ?? t.common.partner
  // An ended outing's fold-back reads as a repayment under the generic label,
  // but it's really "I covered your share on the trip" — say where it came from.
  const payerLabel = tx.kind === 'settlement' && isOutingFoldNote(tx.description)
    ? t.compactRow.outingSettled
    : tx.kind === 'settlement'
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
      // tx.splitRatioA is member A's share (DB schema); flip to the
      // viewer's perspective so the formula below reads it as "my share %"
      // / "other's share %" consistently for both members (#783).
      const meShare = toViewerShare(tx.splitRatioA, viewerIsA)
      const otherShare = 100 - meShare
      delta = payerIsViewer
        ? +Math.ceil(tx.amount * otherShare / 100)
        : -Math.ceil(tx.amount * meShare / 100)
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

  const dateLabel = formatDateRelative(tx.transactedAt, locale, today)

  const noteText = tx.notes?.trim() || null
  const isPending = tx.kind === 'transaction' && tx.status === 'pending'

  const inner = (
    <>
      <div className="flex @max-[16em]:row-span-2 @max-[16em]:self-start"><CategoryChip categoryId={tx.category} size={32} /></div>
      <div className="min-w-0 text-left">
        <div className="text-sm font-medium mb-0.5 flex items-center flex-wrap gap-x-1.5" style={{ color: 'var(--ink)' }}>
          <span className="min-w-0 break-words">{displayLabel}</span>
          {isPending && (
            <span
              className="text-xs tracking-[0.4px] px-1.5 py-px rounded-full shrink-0"
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
          className="text-sm flex items-center flex-wrap gap-x-1.5"
          style={{ color: 'var(--ink-3)' }}
        >
          {dateLabel} · <Avatar memberRole={payerRole} initial={payerInitial} src={payerAvatar} size={16} /> {payerLabel}
        </div>
        {noteText && (
          <div
            className="text-sm mt-1 italic line-clamp-2 break-words"
            style={{ color: 'var(--ink-2)' }}
          >
            “{noteText}”
          </div>
        )}
      </div>
      <div className="text-right @max-[16em]:col-start-2 @max-[16em]:col-span-2 @max-[16em]:row-start-2 @max-[16em]:mt-1">
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
              {formatLedgerAmount(tx.originalAmount, tx.originalCurrency)}
            </div>
            <div
              className="tnum text-sm mt-px"
              style={{ color: 'var(--ink-3)' }}
            >
              ≈ {formatLedgerAmount(tx.amount, baseCurrency)}
            </div>
          </>
        ) : (
          <div
            className="tnum text-sm font-medium tracking-[-0.2px]"
            style={{ fontFamily: 'var(--font-numeric)', color: 'var(--ink)' }}
          >
            {currencySymbol(baseCurrency)}{formatRowAmount(tx.amount, t.compactRow.trillion, t.compactRow.hundredMillion)}
          </div>
        )}
        {showMyShare && (
          <div className="tnum text-sm mt-px" style={{ color: myShareColor }}>
            {/* Compact secondary line: the main amount above carries the full
                symbol (NT$ / CN¥), this one keeps just the sign ($ / ¥). */}
            {currencySymbol(baseCurrency).replace(/^[A-Z]+/, '')}{myShare.toLocaleString('en-US')}
          </div>
        )}
      </div>
    </>
  )

  // The grid is the em container (#1514), on an inner div — Chromium resolves
  // em against the wrong font-size when the container is a <button>. `text-base`
  // gives it a --text-scale-aware font size (rem * scale on iOS, textZoom-scaled
  // px on Android), so the threshold below means "row width in body-text widths"
  // on both. Under 16em (≈ >1.4x on a 358px row) the amount drops under the
  // description instead of squeezing it to ~3 characters per line.
  // Grid cols = the old flex (auto | 1fr | content-sized).
  const cls = "block w-full px-3.5 py-3 text-left bg-transparent border-0"
  const gridCls = "@container text-base grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3"
  // Pending records read as "still in motion" — drop opacity so they recede
  // visually next to settled rows. Badge label still reads at full contrast.
  const style = {
    borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
    opacity: isPending ? 0.6 : 1,
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} cursor-pointer transition-colors duration-100 hover:bg-[rgba(31,27,22,0.03)]`} style={style}>
        <div className={gridCls}>{inner}</div>
      </button>
    )
  }

  return (
    <div className={cls} style={style}>
      <div className={gridCls}>{inner}</div>
    </div>
  )
}
