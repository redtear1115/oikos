import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { oikosGroups, profiles } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { getGroupBalance } from '@/lib/db/queries/balance'
import { listTransactionsPaged } from '@/lib/db/queries/transactions'
import { listIncomeMonthSummary, listIncomesPaged } from '@/lib/db/queries/incomes'
import { resolveViewerEpochWindow, getLatestPriorClosedEpoch } from '@/lib/db/queries/epoch'
import { PartnerLeftCard } from './_components/PartnerLeftCard'
import { WelcomeSoloCard } from './_components/WelcomeSoloCard'
import { listActivePendings } from '@/lib/db/queries/recurringIncome'
import { listActivePendings as listActiveExpensePendings } from '@/lib/db/queries/recurringExpense'
import {
  loadMonthlyReviewSnapshot,
  loadMonthlyReviewMessages,
} from '@/lib/db/queries/monthlyReview'
import {
  currentYearMonthInTaipei,
  previousMonth,
  truncateCodepoints,
} from '@/lib/monthlyReview'
import { incomeToFeedRow } from '@/lib/incomeFeedRow'
import type { PagedTxnRow } from '@/actions/transaction'
import { Dashboard } from './_components/Dashboard'
import { MonthlyReviewBanner } from './_components/MonthlyReviewBanner'
import { getTranslations } from '@/lib/i18n/t'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

const BANNER_QUOTE_MAX_CODEPOINTS = 60

const PAGE_SIZE = 20

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  const [group] = await db
    .select()
    .from(oikosGroups)
    .where(or(eq(oikosGroups.memberA, user.id), eq(oikosGroups.memberB, user.id)))
    .limit(1)
  if (!group) throw new Error('No group')

  // Resolve once and pass to every read; keeps dashboard, banner, and feed
  // cohesive when the viewer is browsing a past epoch.
  const epochWindow = await resolveViewerEpochWindow(group.id)

  // Post-leave cards (PR 4/4): only when not pinned to a past epoch (we want
  // these on the live current view, not on a historical snapshot).
  // - Stayer detection: viewer's group is solo *now* but the most-recent
  //   closed epoch had a memberB. That memberB is the partner who left.
  // - Leaver detection is fully client-side via a localStorage flag set by
  //   LeaveGroupFlow on success — no SSR data needed beyond the group id.
  let partnerLeftProps: { partnerName: string; currentEpochId: string } | null = null
  if (!epochWindow.isPast && !group.memberB && epochWindow.epochId) {
    const prior = await getLatestPriorClosedEpoch(group.id)
    if (prior && prior.memberBId && prior.memberAId === user.id) {
      const [leaverProfile] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, prior.memberBId))
        .limit(1)
      partnerLeftProps = {
        partnerName: leaverProfile?.displayName ?? '',
        currentEpochId: epochWindow.epochId,
      }
    }
  }

  const now = new Date()
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Fast path — what hero/banner needs to paint immediately. Awaited so
  // BalanceHero / SoloBanner / ModeTogglePlaceholder render with real data.
  // The latest income (limit 1) covers the hero label without pulling the full feed.
  const [balance, incomeSummary, pendings, expensePendings, latestIncomes, t] = await Promise.all([
    getGroupBalance(group.id),
    listIncomeMonthSummary(group.id, yyyymm),
    listActivePendings(group.id),
    listActiveExpensePendings(group.id),
    listIncomesPaged(group.id, null, 1, undefined, undefined, undefined, undefined, epochWindow),
    getTranslations(),
  ])

  const recentIncomeLabel = latestIncomes.length > 0
    ? (() => {
        const r = latestIncomes[0]
        const d = new Date(r.occurredAt + 'T00:00:00')
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
        const catKey = r.category as keyof Translations['incomeCategory']
        const catLabel = t.incomeCategory[catKey] ?? t.incomeCategory.other
        return `${dateStr} · ${r.source ?? catLabel}`
      })()
    : null

  // Monthly review banner state. Surface only when:
  //   1. snapshot exists for the previous month
  //   2. viewer hasn't dismissed it
  // Quote prefers the partner's "given to current month" message; falls back
  // to the viewer's own. Solo mode always quotes the viewer.
  const todayYM = currentYearMonthInTaipei()
  const reviewedYM = previousMonth(todayYM)
  const isSolo = !group.memberB
  const viewerIsA = group.memberA === user.id

  const [reviewSnapshot, currentMonthMessages] = await Promise.all([
    loadMonthlyReviewSnapshot(group.id, reviewedYM.year, reviewedYM.month),
    loadMonthlyReviewMessages(group.id, todayYM.year, todayYM.month),
  ])

  let bannerProps: {
    reviewedMonth: typeof reviewedYM
    currentMonth: number
    quote: string | null
    isSolo: boolean
  } | null = null

  if (reviewSnapshot) {
    const dismissedAt = viewerIsA
      ? reviewSnapshot.bannerDismissedByMemberAAt
      : reviewSnapshot.bannerDismissedByMemberBAt

    if (!dismissedAt) {
      const partnerMsg = isSolo
        ? null
        : currentMonthMessages.find((m) => m.memberId !== user.id)
      const ownMsg = currentMonthMessages.find((m) => m.memberId === user.id)
      const preferred = partnerMsg ?? ownMsg ?? null
      bannerProps = {
        reviewedMonth: reviewedYM,
        currentMonth: todayYM.month,
        quote: preferred ? truncateCodepoints(preferred.body, BANNER_QUOTE_MAX_CODEPOINTS) : null,
        isSolo,
      }
    }
  }

  // Slow path — passed as a Promise so the client can wrap it in <Suspense>
  // and stream the feed in after the hero paints. Both queries kick off here
  // (not awaited) and stream over the same RSC payload.
  const feedDataPromise = Promise.all([
    listTransactionsPaged(group.id, null, PAGE_SIZE, undefined, undefined, undefined, undefined, epochWindow),
    listIncomesPaged(group.id, null, PAGE_SIZE, undefined, undefined, undefined, undefined, epochWindow),
  ]).then(([rows, incomeRows]) => {
    const recent: PagedTxnRow[] = rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      splitType: r.splitType,
      splitRatioA: r.splitRatioA ?? null,
      description: r.description,
      category: r.category,
      paidBy: r.paidBy,
      transactedAt: r.transactedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      kind: r.kind,
      assetId: r.assetId,
      fuelLogId: r.fuelLogId ?? null,
      notes: r.notes,
      status: r.status ?? 'settled',
    }))

    const recentIncomeFeed: PagedTxnRow[] = incomeRows.map((r) =>
      incomeToFeedRow({
        id: r.id,
        amount: r.amount,
        category: r.category,
        source: r.source,
        recipientId: r.recipientId,
        assetId: r.assetId,
        occurredAt: r.occurredAt,
        createdAt: r.createdAt.toISOString(),
        kind: 'income',
      })
    )

    return { recent, recentIncomeFeed }
  })

  return (
    <>
      {partnerLeftProps && (
        <PartnerLeftCard
          partnerName={partnerLeftProps.partnerName}
          currentEpochId={partnerLeftProps.currentEpochId}
        />
      )}
      {!partnerLeftProps && !group.memberB && !epochWindow.isPast && (
        <WelcomeSoloCard groupId={group.id} />
      )}
      {bannerProps && (
        <MonthlyReviewBanner
          reviewedMonth={bannerProps.reviewedMonth}
          currentMonth={bannerProps.currentMonth}
          quote={bannerProps.quote}
          isSolo={bannerProps.isSolo}
        />
      )}
      <Dashboard
        balance={balance}
        pageSize={PAGE_SIZE}
        incomeMonthTotal={incomeSummary.total}
        incomeMonthCount={incomeSummary.count}
        recentIncomeLabel={recentIncomeLabel}
        pendings={pendings}
        expensePendings={expensePendings}
        feedDataPromise={feedDataPromise}
        groupDefaultRatioA={group.defaultSplitRatioA ?? null}
      />
    </>
  )
}
