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
 */
export async function recalcGroupBalance(
  groupId: string,
  tx: typeof db | DbTransaction = db,
): Promise<void> {
  // Solo groups (member_b IS NULL) have no one to owe / be owed by — balance is
  // structurally 0. Skipping the formula matters for groups that previously had
  // a partner and inherit historical 'half' / 'weighted' rows after leaveGroup;
  // running the formula on those would produce a nonsense balance.
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
  `)
  return Number(rows[0]?.delta ?? 0)
}
