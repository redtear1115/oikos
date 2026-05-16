import { getCurrentUser } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getGroupBalance, getGroupPendingBalanceDelta } from '@/lib/db/queries/balance'
import { listTransactionsPaged } from '@/lib/db/queries/transactions'
import { listIncomeMonthSummary, listIncomesPaged } from '@/lib/db/queries/incomes'
import { resolveViewerEpochContext, getLatestPriorClosedEpoch } from '@/lib/db/queries/epoch'
import { PartnerLeftCard } from './_components/PartnerLeftCard'
import { WelcomeSoloCard } from './_components/WelcomeSoloCard'
import { listActivePendings } from '@/lib/db/queries/recurringIncome'
import { listActivePendings as listActiveExpensePendings } from '@/lib/db/queries/recurringExpense'
import { listActiveTrips } from '@/lib/db/queries/trips'
import { listRatesForGroup } from '@/lib/db/queries/currencyRates'
import { parseTripCurrencySnapshot } from '@/lib/trip-currency'
import type { TripOption } from './_components/TripSelector'
import type { RateEntry } from './_components/AddSheet'
import { parseCurrencyCode } from '@/lib/currency'
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
import { ActiveTripBanner } from './_components/ActiveTripBanner'
import { getTranslations, getLocale } from '@/lib/i18n/t'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { formatDateRelative } from '@/lib/format-date'

const BANNER_QUOTE_MAX_CODEPOINTS = 60

const PAGE_SIZE = 20

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  // Pin-aware: when pinned to a past epoch (possibly on a different group, see
  // #141), group + window follow the pin so feed + balance scope to the right
  // place. Layout already redirected if no context, so this is non-null here.
  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('No group')
  const { group, window: epochWindow } = context

  // Post-leave cards (PR 4/4): only when not pinned to a past epoch (we want
  // these on the live current view, not on a historical snapshot).
  // - Stayer detection: viewer's group is solo *now* but the most-recent
  //   closed epoch had a memberB. That memberB is the partner who left.
  // - Leaver detection is fully client-side via a localStorage flag set by
  //   LeaveGroupFlow on success — no SSR data needed beyond the group id.
  const shouldCheckPriorLeaver = !epochWindow.isPast && !group.memberB && !!epochWindow.epochId

  const now = new Date()
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Monthly review banner state. Surface only when:
  //   1. snapshot exists for the previous month
  //   2. viewer hasn't dismissed it
  // Quote prefers the partner's "given to current month" message; falls back
  // to the viewer's own. Solo mode always quotes the viewer.
  const todayYM = currentYearMonthInTaipei()
  const reviewedYM = previousMonth(todayYM)
  const isSolo = !group.memberB
  const viewerIsA = group.memberA === user.id

  // Fast path — what hero/banner/post-leave needs to paint immediately. All of
  // these only depend on (group, epochWindow, dates) so they fan out as one
  // Promise.all instead of two sequential awaits. The latest income (limit 1)
  // covers the hero label without pulling the full feed.
  const [
    balance,
    pendingBalanceDelta,
    incomeSummary,
    pendings,
    expensePendings,
    latestIncomes,
    t,
    locale,
    reviewSnapshot,
    currentMonthMessages,
    priorClosedEpoch,
    rawActiveTrips,
    rawRates,
  ] = await Promise.all([
    getGroupBalance(group.id),
    getGroupPendingBalanceDelta(group.id),
    listIncomeMonthSummary(group.id, yyyymm, epochWindow),
    listActivePendings(group.id),
    listActiveExpensePendings(group.id),
    listIncomesPaged(group.id, null, 1, undefined, undefined, undefined, undefined, epochWindow),
    getTranslations(),
    getLocale(),
    loadMonthlyReviewSnapshot(group.id, reviewedYM.year, reviewedYM.month),
    loadMonthlyReviewMessages(group.id, todayYM.year, todayYM.month),
    shouldCheckPriorLeaver ? getLatestPriorClosedEpoch(group.id) : Promise.resolve(null),
    epochWindow.epochId
      ? listActiveTrips(group.id, epochWindow.epochId)
      : Promise.resolve([]),
    listRatesForGroup(group.id),
  ])

  // Map raw DB rows to the prop shapes the client components expect.
  // v0.17.4 #410: parse rate_snapshot so AddSheet's currency picker can show
  // the trip's own selected codes (not the 4-preset fallback).
  const activeTrips: TripOption[] = rawActiveTrips.map((trip) => ({
    id: trip.id,
    name: trip.name,
    defaultCurrency: trip.defaultCurrency,
    startDate: trip.startDate,
    endDate: trip.endDate ?? null,
    currencies: parseTripCurrencySnapshot(
      trip.rateSnapshot,
      trip.defaultCurrency ?? group.baseCurrency,
    ),
  }))

  const rates: RateEntry[] = rawRates.map((r) => ({
    fromCurrency: r.fromCurrency,
    toCurrency: r.toCurrency,
    rate: r.rate,
  }))

  let partnerLeftProps: { partnerName: string; currentEpochId: string } | null = null
  if (
    priorClosedEpoch &&
    priorClosedEpoch.memberBId &&
    priorClosedEpoch.memberAId === user.id &&
    epochWindow.epochId
  ) {
    const [leaverProfile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, priorClosedEpoch.memberBId))
      .limit(1)
    partnerLeftProps = {
      partnerName: leaverProfile?.displayName ?? '',
      currentEpochId: epochWindow.epochId,
    }
  }

  const recentIncomeLabel = latestIncomes.length > 0
    ? (() => {
        const r = latestIncomes[0]
        const dateStr = formatDateRelative(r.occurredAt, locale)
        const catKey = r.category as keyof Translations['incomeCategory']
        const catLabel = t.incomeCategory[catKey] ?? t.incomeCategory.other
        return `${dateStr} · ${r.source ?? catLabel}`
      })()
    : null

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
    listTransactionsPaged({ groupId: group.id, cursor: null, limit: PAGE_SIZE, epochWindow }),
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
      originalCurrency: r.originalCurrency ?? null,
      originalAmount: r.originalAmount ?? null,
      rateSnapshot: r.rateSnapshot ?? null,
      tripId: r.tripId ?? null,
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
      {!epochWindow.isPast && (
        <ActiveTripBanner
          trips={activeTrips}
          baseCurrency={(group.baseCurrency as CurrencyCode) ?? 'twd'}
        />
      )}
      <Dashboard
        balance={balance}
        pendingBalanceDelta={pendingBalanceDelta}
        pageSize={PAGE_SIZE}
        incomeMonthTotal={incomeSummary.total}
        incomeMonthCount={incomeSummary.count}
        recentIncomeLabel={recentIncomeLabel}
        pendings={pendings}
        expensePendings={expensePendings}
        feedDataPromise={feedDataPromise}
        groupDefaultRatioA={group.defaultSplitRatioA ?? null}
        baseCurrency={parseCurrencyCode(group.baseCurrency) ?? 'twd'}
        activeTrips={activeTrips}
        rates={rates}
      />
    </>
  )
}
