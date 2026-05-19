import { revalidatePath } from 'next/cache'

/**
 * Cross-cutting revalidation helpers. Replaces ad-hoc `revalidatePath` calls
 * sprinkled across `actions/`. Each helper documents which pages it refreshes
 * so a future change to the affected page surface is one edit, not 40.
 *
 * Naming convention: `revalidateAfter<Domain>Mutation()` — call after a write
 * has succeeded, before returning.
 */

/**
 * Cash transaction / settlement write. Refreshes the dashboard summary and
 * the records feed. When the transaction is tied to an asset (e.g. car
 * purchase, fuel log), pass the asset id(s) so the asset detail page is
 * invalidated too. `previousAssetId` covers the edit case where a txn is
 * moved between assets.
 */
export function revalidateAfterTransactionMutation(opts?: {
  assetId?: string | null
  previousAssetId?: string | null
}) {
  revalidatePath('/dashboard')
  revalidatePath('/records')
  if (opts?.assetId) revalidatePath(`/assets/${opts.assetId}`)
  if (
    opts?.previousAssetId &&
    opts.previousAssetId !== opts.assetId
  ) {
    revalidatePath(`/assets/${opts.previousAssetId}`)
  }
}

/**
 * Income write. Refreshes dashboard summary and records feed.
 */
export function revalidateAfterIncomeMutation() {
  revalidatePath('/dashboard')
  revalidatePath('/records')
}

/**
 * Asset CRUD. Refreshes the list page and (when an id is supplied) the
 * detail page. Pass `affectsRecords` when the change can flow into the
 * records feed (rename → AddSheet asset-picker label; soft-delete → "(已刪除)"
 * suffix). Pass `affectsDashboard` when the change creates / removes a
 * linked cash transaction.
 */
export function revalidateAfterAssetMutation(
  assetId?: string | null,
  opts?: { affectsRecords?: boolean; affectsDashboard?: boolean },
) {
  revalidatePath('/assets')
  if (assetId) revalidatePath(`/assets/${assetId}`)
  if (opts?.affectsRecords) revalidatePath('/records')
  if (opts?.affectsDashboard) revalidatePath('/dashboard')
}

/**
 * Recurring expense rule CRUD. Refreshes the rule list page and the
 * dashboard (which surfaces pending instances).
 */
export function revalidateAfterRecurringExpenseRuleMutation() {
  revalidatePath('/settings/recurring')
  revalidatePath('/dashboard')
}

/**
 * Recurring income rule CRUD. Refreshes the rule list page and the
 * dashboard (which surfaces pending instances).
 */
export function revalidateAfterRecurringIncomeRuleMutation() {
  revalidatePath('/settings/recurring')
  revalidatePath('/dashboard')
}

/**
 * Settings page changed (group name, profile fields, invoice creds, etc.).
 */
export function revalidateSettings() {
  revalidatePath('/settings')
}

/**
 * CSV import write or rollback (#607). A batch touches both CashTransactions
 * and IncomeTransactions, so the dashboard summary, records feed, and the
 * import history surface all need to refresh.
 */
export function revalidateAfterImportMutation() {
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/settings/import')
}

/**
 * Profile changes that bleed across the whole app (display name, avatar,
 * default split). Records + dashboard render names; settings shows the row.
 */
export function revalidateAfterProfileMutation() {
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/settings')
}

/**
 * Epoch view pin / unpin. The pin changes every data-bearing surface, so
 * everything has to come back from the server.
 */
export function revalidateAfterEpochViewChange() {
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/aibutsu')
  revalidatePath('/settings')
}

/**
 * Membership flow (invite accept, swap propose/accept/cancel, leaveGroup,
 * etc.). Touches dashboard + records + settings — leaving / rejoining
 * changes both the data surface and the membership UI.
 */
export function revalidateAfterMembershipChange() {
  revalidatePath('/dashboard')
  revalidatePath('/records')
  revalidatePath('/settings')
}
