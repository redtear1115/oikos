-- #837 — Phase B of the asset-PII encryption rollout: drop the legacy
-- plaintext columns now that `scripts/encrypt-existing-pii.mjs` has run on
-- every environment and the write paths populate the encrypted columns only.
--
-- DESTRUCTIVE + irreversible. Guarded by the issue's pre-condition checklist:
-- the backfill DRY_RUN must report `plate=0 address=0` on dev AND prod
-- immediately before applying this, confirming no unencrypted legacy value
-- remains. Recovery if a row was missed = Supabase point-in-time restore.

ALTER TABLE "CarDetails"   DROP COLUMN IF EXISTS "plate";
ALTER TABLE "HouseDetails" DROP COLUMN IF EXISTS "address";
