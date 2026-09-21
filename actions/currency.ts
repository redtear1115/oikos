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

  // Check and update in ONE transaction, after locking the group row (#943).
  // createOuting takes this row FOR SHARE and copies base_currency into the
  // outing, so the two now serialize: either the outing commits first and the
  // check below counts it (locked), or this update commits first and the
  // outing is opened in the new currency. Checked outside a transaction, an
  // outing could commit between the check and the update and keep the old
  // currency — endOuting would then refuse to fold it, and the base could not
  // be switched back because the outing itself holds the lock.
  //
  // `created_at`, not the event dates — a backdated / imported row still
  // belongs to the chapter it was recorded in. Shared with the settings page so
  // the disabled selector and this guard can't drift apart again (#1106).
  const fromCurrency = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        id: oikosGroups.id,
        baseCurrency: oikosGroups.baseCurrency,
        currentEpochStartedAt: oikosGroups.currentEpochStartedAt,
      })
      .from(oikosGroups)
      .where(eq(oikosGroups.id, group.id))
      .for('update')
    if (!locked) throw actionError('group_not_found')
    if (input.currency === locked.baseCurrency) return null  // no-op, re-checked under the lock

    if (await currentEpochHasRecords(locked, tx)) {
      throw actionError('base_currency_locked')
    }

    await tx
      .update(oikosGroups)
      .set({ baseCurrency: input.currency })
      .where(eq(oikosGroups.id, group.id))
    return locked.baseCurrency
  })
  if (fromCurrency === null) return

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
