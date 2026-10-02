import { db } from '@/lib/db/client'
import { assets } from '@/lib/db/schema'
import { and, eq, isNull, type SQL } from 'drizzle-orm'
import { actionError } from '@/lib/action-errors'

/**
 * #1442 — the one WHERE predicate every asset *write* in `actions/asset.ts`
 * and `actions/fuelLog.ts` filters on: this id, in this group, not a frozen
 * copy, and (unless `allowDeleted`) not soft-deleted.
 *
 * Frozen copies (`Assets.frozen_at IS NOT NULL`) are the read-only stand-ins
 * leaveGroup leaves in a record's own ledger. Excluding them here is what
 * makes them read-only: the site then sees "no such asset" and returns the
 * code it already returns for that case, so no new error code / copy exists.
 *
 * `allowDeleted` is for the few sites that already accepted (or reported
 * separately) a soft-deleted asset — they keep doing so; only frozen copies
 * are newly excluded there.
 *
 * `keepFrozenId` is the "unchanged link" exemption for a *link* check (an
 * insurance policy's vehicle / insured child): a frozen copy equal to it
 * passes. Callers pass the value read from their own stored row, scoped to
 * the viewer's group — never a client-supplied value — so a link leaveGroup
 * re-pointed at a copy can be kept while nothing can newly choose one. It
 * must not be passed by a site that writes to the asset row itself.
 *
 * Failure looks like: nothing errors. A site that filters with a hand-written
 * `eq(assets.groupId, …)` instead of this predicate silently lets the user
 * rename / delete / log fuel on a frozen copy. tests/frozen-asset-write-guard
 * .test.ts fails when such a site appears.
 */
export function writableAsset(
  id: string,
  groupId: string,
  opts: { allowDeleted?: boolean; keepFrozenId?: string | null } = {},
): SQL {
  const keepFrozen = !!opts.keepFrozenId && opts.keepFrozenId === id
  return and(
    eq(assets.id, id),
    eq(assets.groupId, groupId),
    keepFrozen ? undefined : isNull(assets.frozenAt),
    opts.allowDeleted ? undefined : isNull(assets.deletedAt),
  ) as SQL
}

/**
 * Assert that the given asset belongs to the active group and is not
 * soft-deleted. Used by write actions (transaction / income / recurring*) to
 * guard the optional `assetId` foreign key before insert.
 *
 * #1442 — a frozen copy (see `writableAsset`) is rejected with
 * `linked_asset_not_in_group`: a record may keep the frozen link it already
 * has, but nothing may newly link to one. `keepFrozenId` is that exemption —
 * the caller passes the value it read from its *own stored row* (group-scoped,
 * never from the client); a frozen asset equal to it is accepted unchanged.
 *
 * Error messages use the product term 「愛物」 per CLAUDE.md naming convention
 * — callers should not pass a custom message here (use direct assertion at the
 * callsite instead if you need a different surface).
 */
export async function assertAssetInGroup(
  assetId: string,
  groupId: string,
  opts: { keepFrozenId?: string | null } = {},
): Promise<void> {
  const [asset] = await db
    .select({ id: assets.id, deletedAt: assets.deletedAt, frozenAt: assets.frozenAt })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.groupId, groupId)))
    .limit(1)
  if (!asset) throw new Error('關聯愛物不在家計簿內')
  if (asset.frozenAt && !(opts.keepFrozenId && opts.keepFrozenId === assetId)) {
    throw actionError('linked_asset_not_in_group')
  }
  if (asset.deletedAt) throw new Error('關聯愛物已刪除')
}
