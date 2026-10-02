-- 0073 — Assets.frozen_at: frozen copies left behind by leaveGroup (#1442)
--
-- When member B leaves a duo ledger, a record can end up in one ledger while
-- the 愛物 it points at moves to (or stays in) the other. leaveGroup now
-- re-points such a record at a *frozen copy* of the asset created in the
-- record's own ledger (display fields only: type / name / template_key; no
-- name_encrypted, notes, template_fields or *Details rows). frozen_at marks
-- those copies: they are read-only (enforced server-side in actions/, see
-- lib/auth/asset.ts › writableAsset) and hidden from lists and pickers.
--
-- Deliberately no column pointing back at the source asset: that would be a
-- cross-ledger reference itself (the #1457 account-deletion problem).
--
-- Additive and nullable: safe to apply before the code that reads it ships;
-- older code simply ignores it. Idempotent.

ALTER TABLE "Assets" ADD COLUMN IF NOT EXISTS frozen_at timestamptz;
