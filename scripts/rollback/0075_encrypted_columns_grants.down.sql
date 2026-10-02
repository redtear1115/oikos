-- ROLLBACK for drizzle/0075_encrypted_columns_grants.sql — DEV ONLY, NEVER RUN AUTOMATICALLY.
-- Not a drizzle migration: drizzle-kit only runs files listed in drizzle/meta/_journal.json.
--
-- What it does:
--   1. Drops the column-level SELECT grants 0075 gave authenticated on Assets.
--   2. Restores Supabase's default table grants (what the default ACL handed
--      out when the tables were created): ALL on the seven tables to anon and
--      authenticated. This brings back #1471 — `*_encrypted` ciphertext is
--      readable through the Data API and rides in Assets realtime frames again.
--   3. Removes 0075's row from drizzle.__drizzle_migrations so `db:migrate`
--      would re-apply it.
--
-- service_role and futari_app are untouched by 0075 and by this file.
--
-- Run inside one transaction:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f <this file>

-- 1. column grants on Assets
REVOKE SELECT ("id", "group_id", "type", "name", "notes", "template_key", "template_fields", "deleted_at", "created_at", "frozen_at")
  ON TABLE "Assets" FROM authenticated;

-- 2. default table grants
GRANT ALL ON TABLE "Assets", "CarDetails", "ChildDetails", "HouseDetails", "InsuranceDetails", "PetDetails", "InvoiceCredentials"
  TO anon, authenticated;

-- 3. migration row
DELETE FROM drizzle.__drizzle_migrations
 WHERE hash = 'e157b061de5c274702a52d4b70653288adf39c4de4f97ebe063d3c7d5d169a78' OR created_at = 1783200000000;
