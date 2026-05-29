-- #826 — Phase A of the asset-PII encryption rollout.
-- Adds three nullable encrypted-text columns next to the existing plain
-- columns. Old plain columns stay populated for the transition window so
-- nothing breaks; the next-stage migration (separate PR) will drop them
-- once `scripts/encrypt-existing-pii.mjs` has run on every environment
-- and all write paths are confirmed to populate the encrypted column.

ALTER TABLE "Assets"       ADD COLUMN IF NOT EXISTS "name_encrypted"    text;
ALTER TABLE "CarDetails"   ADD COLUMN IF NOT EXISTS "plate_encrypted"   text;
ALTER TABLE "HouseDetails" ADD COLUMN IF NOT EXISTS "address_encrypted" text;
