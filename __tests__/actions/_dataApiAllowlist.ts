// ─── #1518 — what anon / authenticated may touch, read from the catalog ──────
//
// `privilegeLines` lists every privilege anon or authenticated holds on any
// relation (table, view, sequence, …) and function in schema public, one line
// per (object, role): table-level privileges as `T:…`, column-level ones that
// the table level does not already give as `C:PRIV(col,…)`, sequences as
// `S:…`, functions as `fn(args)|role|EXECUTE`. `ALLOWLIST_AFTER_0080` is the
// exact set 0080 leaves. Anything else is a grant Supabase's default ACL (or a
// hand-made GRANT) put back — a table readable through GET /rest/v1/<table>.
//
// Failure look of what this guards: nothing errors. A new table or function
// created by `postgres` gets anon + authenticated ALL from the default ACL,
// and a later partner can read it with their own session.

import type { Sql, TransactionSql } from 'postgres'

const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
const COLUMN_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']

export async function privilegeLines(db: Sql | TransactionSql): Promise<string[]> {
  const sql = db as Sql
  const rels = await sql<{ line: string }[]>`
    WITH roles(role) AS (VALUES ('anon'), ('authenticated')),
    rels AS (
      SELECT c.oid, c.relname, c.relkind FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ),
    tbl AS (
      SELECT r.relname, ro.role,
             array(SELECT p FROM unnest(${TABLE_PRIVS}::text[]) WITH ORDINALITY u(p, o)
                    WHERE has_table_privilege(ro.role, r.oid, p) ORDER BY o) AS privs
        FROM rels r CROSS JOIN roles ro
    ),
    col AS (
      SELECT r.relname, ro.role, p.priv,
             string_agg(a.attname, ',' ORDER BY a.attname) AS cols
        FROM rels r CROSS JOIN roles ro
        CROSS JOIN unnest(${COLUMN_PRIVS}::text[]) p(priv)
        JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
       WHERE has_column_privilege(ro.role, r.oid, a.attnum, p.priv)
         AND NOT has_table_privilege(ro.role, r.oid, p.priv)
       GROUP BY 1, 2, 3
    )
    SELECT relname || '|' || role || '|T:' || array_to_string(privs, ',') AS line FROM tbl WHERE cardinality(privs) > 0
    UNION ALL
    SELECT relname || '|' || role || '|C:' || priv || '(' || cols || ')' FROM col
    UNION ALL
    SELECT c.relname || '|' || ro.role || '|S:' ||
           array_to_string(array(SELECT p FROM unnest(array['USAGE', 'SELECT', 'UPDATE']) p
                                  WHERE has_sequence_privilege(ro.role, c.oid, p)), ',')
      FROM pg_class c CROSS JOIN roles ro
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
       AND has_sequence_privilege(ro.role, c.oid, 'USAGE, SELECT, UPDATE')
    UNION ALL
    SELECT p.oid::regprocedure::text || '|' || ro.role || '|EXECUTE'
      FROM pg_proc p CROSS JOIN roles ro
     WHERE p.pronamespace = 'public'::regnamespace
       AND has_function_privilege(ro.role, p.oid, 'EXECUTE')`
  return rels.map((r) => r.line).sort()
}

/** Exactly what anon / authenticated hold in schema public after 0080. */
export const ALLOWLIST_AFTER_0080 = [
  // 0075 — Realtime + the FuelLogs / *Details policies; never name_encrypted.
  'Assets|authenticated|C:SELECT(created_at,deleted_at,frozen_at,group_id,id,name,notes,template_fields,template_key,type)',
  // Realtime handlers parse the whole payload.
  'CashTransactions|authenticated|T:SELECT',
  'FuelLogs|authenticated|T:SELECT',
  'IncomeTransactions|authenticated|T:SELECT',
  'Settlements|authenticated|T:SELECT',
  // Realtime, column-trimmed: filter column + key + what the handler reads.
  'GroupBalance|authenticated|C:SELECT(balance,group_id,version)',
  'OikosGroups|authenticated|C:SELECT(id,member_a,member_b)',
  'PendingExpenseOccurrences|authenticated|C:SELECT(group_id,id)',
  'PendingIncomeOccurrences|authenticated|C:SELECT(group_id,id)',
  'RecurringExpenseRules|authenticated|C:SELECT(group_id,id)',
  'RecurringIncomeRules|authenticated|C:SELECT(group_id,id)',
  // lib/pushNotifications.ts upsert (INSERT … ON CONFLICT DO UPDATE).
  'PushTokens|authenticated|T:SELECT,INSERT,UPDATE',
  // Pure date arithmetic, reads no table (Supabase default grant, left as is).
  'compute_next_occurrence(date,integer,integer)|anon|EXECUTE',
  'compute_next_occurrence(date,integer,integer)|authenticated|EXECUTE',
  // SECURITY DEFINER helpers that answer only about the caller (0079, 0080).
  'frozen_copy_visible(uuid,timestamp with time zone)|authenticated|EXECUTE',
  'viewer_in_chapter(uuid,timestamp with time zone)|authenticated|EXECUTE',
].sort()
