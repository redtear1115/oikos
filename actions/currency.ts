'use server'

import { db } from '@/lib/db/client'
import { oikosGroups } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { currentEpochHasRecords } from '@/lib/db/queries/epoch'
import { upsertRate } from '@/lib/db/queries/currencyRates'
import { revalidatePath } from 'next/cache'
import { captureServer } from '@/lib/analytics/server'
import { action, actionError } from '@/lib/action-errors'

export const setBaseCurrency = action(async (input: { currency: CurrencyCode }) => {
  const { user, group } = await requireViewerGroup()
  if (!CURRENCIES.includes(input.currency)) {
    throw actionError('currency_unsupported')
  }
  if (input.currency === group.baseCurrency) {
    return  // no-op
  }

  // `created_at`, not the event dates — a backdated / imported row still
  // belongs to the chapter it was recorded in. Shared with the settings page so
  // the disabled selector and this guard can't drift apart again (#1106).
  if (await currentEpochHasRecords(group)) {
    throw actionError('base_currency_locked')
  }

  const fromCurrency = group.baseCurrency

  await db
    .update(oikosGroups)
    .set({ baseCurrency: input.currency })
    .where(eq(oikosGroups.id, group.id))

  revalidatePath('/settings/currency')

  // Segment signal (#819): cross-border indicator.
  await captureServer(user.id, 'base_currency_changed', {
    from_currency: fromCurrency,
    to_currency: input.currency,
  })
})

export const setRate = action(async (input: {
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: string
}) => {
  const { group } = await requireViewerGroup()
  if (input.fromCurrency === input.toCurrency) throw actionError('currency_pair_same')
  const parsed = parseFloat(input.rate)
  if (!Number.isFinite(parsed) || parsed <= 0) throw actionError('fx_rate_not_positive')
  await upsertRate({
    groupId: group.id,
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    rate: input.rate,
  })
  revalidatePath('/settings/currency')
})
