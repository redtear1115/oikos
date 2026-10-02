-- 0075 — keep encrypted-column ciphertext out of the browser (#1471)
--
-- #1466 stopped the app's own payloads from carrying `*_encrypted` values.
-- Two database-side paths still handed the ciphertext to any signed-in member
-- (and the grant to anon):
--
--   1. Supabase Realtime. `Assets` is in publication `supabase_realtime`, and
--      postgres_changes sends every column the subscriber's role may SELECT —
--      including `name_encrypted` (observed on dev 2026-10-02: INSERT and
--      UPDATE frames carried it).
--   2. The Data API (PostgREST). Supabase's default ACL gave `anon` and
--      `authenticated` full table privileges on every table below, so a member
--      could `GET /rest/v1/Assets?select=name_encrypted` with the browser's own
--      session and RLS returned their group's rows.
--
-- The app never touches these tables through supabase-js: all reads and writes
-- are server-side Drizzle on `futari_app` (0072; BYPASSRLS, its own grants —
-- untouched here). The only client-side use is the Realtime subscription on
-- `Assets` in app/(dashboard)/_components/RealtimeProvider.tsx, plus the RLS
-- policies on FuelLogs / *Details, which sub-select `Assets.id` and
-- `Assets.group_id` as the subscriber's role.
--
-- What this does
--   * Assets: anon gets nothing. authenticated keeps SELECT on every column
--     except `name_encrypted` (column-level grant), and loses INSERT / UPDATE /
--     DELETE / TRUNCATE / REFERENCES / TRIGGER (never used; RLS had no write
--     policy anyway, but TRUNCATE ignores RLS).
--   * CarDetails, ChildDetails, HouseDetails, InsuranceDetails, PetDetails,
--     InvoiceCredentials: nothing for anon or authenticated (same as 0066 for
--     the outing tables). None is in the realtime publication.
--   * The explicit column-level REVOKEs make the result independent of any
--     column grant someone may have added by hand: a table-level REVOKE does
--     not remove a column-level grant.
--
-- Why NOT a publication column list
--   `ALTER PUBLICATION supabase_realtime ADD TABLE "Assets" (…)` without
--   `name_encrypted` was tried on dev first and changed nothing: the frames
--   still carried `name_encrypted`. Supabase Realtime reads the slot through
--   wal2json (realtime.list_changes), which ignores publication column lists;
--   what filters the payload is realtime.apply_rls, which drops every column
--   the subscriber's role lacks SELECT on (has_column_privilege). So the
--   column grant is the control for both paths.
--
-- What failure looks like
--   * If a later migration adds a column to Assets, authenticated gets NO
--     SELECT on it (column grants are per column; default privileges don't
--     cover new columns). Nothing errors: Realtime frames just omit that
--     column. If a realtime parser (lib/realtime/payload-schema.ts) ever
--     requires it, the parser rejects the frame and the live update silently
--     stops — the page still updates on refresh. Fix: a migration with
--     `GRANT SELECT ("new_col") ON "Assets" TO authenticated` (never for a
--     `*_encrypted` column).
--   * If `id` or `group_id` lose authenticated SELECT, realtime delivers
--     "Error 401" frames instead of rows and the FuelLogs / *Details RLS
--     policies stop matching — the dashboard stops live-updating, no error
--     surfaces in the UI.
--   * A new table with an `*_encrypted` column created by `postgres` gets
--     anon / authenticated full grants from Supabase's default ACL. Nothing
--     errors; the ciphertext is readable through the Data API again.
--     __tests__/actions/encryptedColumnGrants1471.test.ts lists every
--     `*_encrypted` column on dev and fails if either role can SELECT one.
--
-- Rollback: scripts/rollback/0075_encrypted_columns_grants.down.sql (dev only).
-- Idempotent: safe to re-apply.

REVOKE ALL ON TABLE "Assets" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ("name_encrypted") ON TABLE "Assets" FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT ("id", "group_id", "type", "name", "notes", "template_key", "template_fields", "deleted_at", "created_at", "frozen_at")
  ON TABLE "Assets" TO authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "CarDetails", "ChildDetails", "HouseDetails", "InsuranceDetails", "PetDetails", "InvoiceCredentials"
  FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ("plate_encrypted") ON TABLE "CarDetails" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ("id_number_encrypted", "insurance_id_encrypted") ON TABLE "ChildDetails" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ("address_encrypted") ON TABLE "HouseDetails" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ("verification_code_encrypted") ON TABLE "InvoiceCredentials" FROM anon, authenticated;
