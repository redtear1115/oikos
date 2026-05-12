import { createClient } from '@/lib/supabase/server'
import { resolveViewerEpochContext } from '@/lib/db/queries/epoch'

/**
 * Read context for write paths. Resolves viewer + group + epoch window, then
 * asserts the viewer is NOT pinned to a past epoch. Throws if pinned.
 *
 * Use this in every server action that mutates transaction-class data
 * (CashTransactions / IncomeTransactions / Settlements / FuelLogs). The
 * past-epoch read-only policy lives here as a single source of truth.
 */
export async function getViewerWriteContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const context = await resolveViewerEpochContext(user.id)
  if (!context) throw new Error('找不到家計簿')
  if (context.window.isPast) throw new Error('過去章節不可編輯')

  return { user, group: context.group }
}
