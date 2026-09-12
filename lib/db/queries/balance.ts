import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'

// The transaction handle Drizzle hands to the .transaction(cb) callback —
// extracted from `db.transaction`'s callback signature so we don't need to
// hand-type the deeply-generic PgTransaction<HKT, FullSchema, TablesConfig>.
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Recompute and persist GroupBalance from active transactions + settlements.
 * MUST be called within the same DB transaction as any mutating write.
 * Pass `tx` if running inside a Drizzle transaction; falls back to `db` otherwise.
 *
 * Scoped to the CURRENT epoch (issue #1030): rows are filtered to
 * `transacted_at >= OikosGroups.current_epoch_started_at`. Per
 * docs/superpowers/specs/solo-trip-design.md, balance follows the same
 * "current chapter only" rule as /records, stats and dashboard — a
 * cross-epoch balance would show a debt no one can settle or edit, since
 * `epoch-readonly` only allows writes into the current epoch.
 *
 * Without this, `leaveGroup` moving the stayer-side legs of settled
 * transactions to the leaver's new group (while the payer-side legs of the
 * *other* member's settlement stay behind) leaves the stayer's group with a
 * structurally non-zero sum over ALL history. That residue used to be masked
 * by the solo short-circuit below; a new partner accepting the invite
 * inherits it as soon as this formula next runs. current_epoch_started_at is
 * bumped in lockstep with GroupEpochs on every leave/accept (same DB
 * transaction, see actions/membership.ts + actions/invite.ts), so it's a
 * correct, index-friendly proxy for "the current chapter" without an extra
 * join to GroupEpochs.
 */
export async function recalcGroupBalance(
  groupId: string,
  tx: typeof db | DbTransaction = db,
): Promise<void> {
  // Solo groups (member_b IS NULL) have no one to owe / be owed by — balance is
  // structurally 0. Kept as defense-in-depth even now that epoch scoping makes
  // the formula itself resolve to 0 for solo groups under the normal UI flow
  // (AddSheet forces splitType='all_mine' when isSolo — see
  // app/(dashboard)/dashboard/_components/AddSheet.tsx:293): nothing at the
  // server layer currently rejects a non-'all_mine' split_type paid solely by
  // member_a on a solo group, so this remains the only hard guarantee.
  await tx.execute(sql`
    UPDATE "GroupBalance"
    SET balance = CASE
      WHEN (SELECT member_b FROM "OikosGroups" WHERE id = ${groupId}) IS NULL THEN 0
      ELSE (
        SELECT COALESCE(SUM(
          CASE
            WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId})
              THEN CASE split_type
                WHEN 'all_mine'   THEN 0
                WHEN 'all_theirs' THEN amount
                WHEN 'half'       THEN CEIL(amount / 2.0)::int
                WHEN 'weighted'   THEN CEIL(amount * (100 - split_ratio_a) / 100.0)::int
              END
            ELSE CASE split_type
                WHEN 'all_mine'   THEN 0
                WHEN 'all_theirs' THEN -amount
                WHEN 'half'       THEN -CEIL(amount / 2.0)::int
                WHEN 'weighted'   THEN -CEIL(amount * split_ratio_a / 100.0)::int
              END
          END
        ), 0)
        FROM "CashTransactions"
        WHERE group_id = ${groupId}
          AND deleted_at IS NULL
          AND status = 'settled'
          AND transacted_at >= (SELECT current_epoch_started_at FROM "OikosGroups" WHERE id = ${groupId})
      ) + (
        -- Settlement deltas (matches lib/balance.ts settlementDelta):
        -- paid_by = member_a (A paid B) → +amount (B now indebted to A)
        -- paid_by = member_b (B paid A) → -amount (A now indebted to B)
        SELECT COALESCE(SUM(
          CASE
            WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId}) THEN amount
            ELSE -amount
          END
        ), 0)
        FROM "Settlements"
        WHERE group_id = ${groupId} AND deleted_at IS NULL
          AND settled_at >= (SELECT current_epoch_started_at FROM "OikosGroups" WHERE id = ${groupId})
      )
    END,
    version = version + 1,
    last_calculated_at = NOW()
    WHERE group_id = ${groupId};
  `)
}

export async function getGroupBalance(groupId: string): Promise<number> {
  const rows = await db.execute<{ balance: number }>(sql`
    SELECT balance FROM "GroupBalance" WHERE group_id = ${groupId} LIMIT 1
  `)
  return Number(rows[0]?.balance ?? 0)
}

/**
 * Sum of balance deltas for `status = 'pending'` transactions (issue #164 v2).
 *
 * GroupBalance.balance caches the settled-only view (see recalcGroupBalance).
 * Add this delta on top to get the "after-settle" / include-pending view.
 *
 * Returns 0 for solo groups (no member_b means balance is structurally 0;
 * matches the recalcGroupBalance solo guard).
 *
 * Scoped to the current epoch (issue #1030), same rationale as
 * recalcGroupBalance: this is a live, read-time computation (no cache), so a
 * stayer's leftover pending row from a prior duo chapter would otherwise
 * surface in a new partner's dashboard the moment they accept the invite —
 * before any write ever happens.
 */
export async function getGroupPendingBalanceDelta(groupId: string): Promise<number> {
  const rows = await db.execute<{ delta: number }>(sql`
    SELECT CASE
      WHEN (SELECT member_b FROM "OikosGroups" WHERE id = ${groupId}) IS NULL THEN 0
      ELSE COALESCE(SUM(
        CASE
          WHEN paid_by = (SELECT member_a FROM "OikosGroups" WHERE id = ${groupId})
            THEN CASE split_type
              WHEN 'all_mine'   THEN 0
              WHEN 'all_theirs' THEN amount
              WHEN 'half'       THEN CEIL(amount / 2.0)::int
              WHEN 'weighted'   THEN CEIL(amount * (100 - split_ratio_a) / 100.0)::int
            END
          ELSE CASE split_type
              WHEN 'all_mine'   THEN 0
              WHEN 'all_theirs' THEN -amount
              WHEN 'half'       THEN -CEIL(amount / 2.0)::int
              WHEN 'weighted'   THEN -CEIL(amount * split_ratio_a / 100.0)::int
            END
        END
      ), 0)
    END AS delta
    FROM "CashTransactions"
    WHERE group_id = ${groupId}
      AND deleted_at IS NULL
      AND status = 'pending'
      AND transacted_at >= (SELECT current_epoch_started_at FROM "OikosGroups" WHERE id = ${groupId})
  `)
  return Number(rows[0]?.delta ?? 0)
}
