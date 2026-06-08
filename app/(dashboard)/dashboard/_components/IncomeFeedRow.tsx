import { CompactRow } from './CompactRow'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import type { PagedTxnRow } from '@/actions/transaction'

const P = DEFAULT_INCOME_PALETTE

/**
 * Mint-glow row renderer for income entries in a mixed (全部 / 收入) feed.
 * Returns `undefined` for non-income rows so `TransactionFeed` falls back to
 * its default row. Shared by the Dashboard income feed and the Records list so
 * the gradient wrapper stays in one place (#897).
 */
export function renderIncomeFeedRow(
  tx: PagedTxnRow,
  onClick: (tx: PagedTxnRow) => void,
): React.ReactNode | undefined {
  if (tx.kind !== 'income') return undefined
  return (
    <div style={{ background: `linear-gradient(90deg, ${P.glow}55, transparent 60%)` }}>
      <CompactRow tx={tx} isLast={false} onClick={() => onClick(tx)} />
    </div>
  )
}
