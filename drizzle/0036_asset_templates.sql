-- v0.16.0 #222 — 愛物模板系統（v1: 只有 general）
--
-- Lightweight, free-text asset tracking on top of a small registry of
-- templates. v1 ships ONE template — `general` — wired to the new 「物品」
-- entry in TypePicker. The existing five emotion-rich asset types
-- (car / child / pet / plant / house) keep their dedicated *Details subtables
-- and *SheetBody flows untouched; `insurance` likewise stays on its own
-- path (it's owned by 守護, not 愛物).
--
-- Adding future templates means appending to the enum below and updating
-- lib/assetTemplates.ts. Postgres can't drop enum values once added, so the
-- enum is intentionally minimal at launch.
--
-- Coexistence with legacy detail subtables:
--   - Legacy assets have `template_key = NULL` and continue to use their
--     subtable detail rows + the existing *SheetBody edit paths.
--   - Template-based assets have `template_key` set and `type='item'`. They
--     DO NOT participate in FuelLog, SavingsView, recurring insurance premium
--     flows, or any other legacy automation — by design.

ALTER TYPE "asset_type" ADD VALUE IF NOT EXISTS 'item';

CREATE TYPE "asset_template_key" AS ENUM ('general');

ALTER TABLE "Assets"
  ADD COLUMN "template_key" "asset_template_key",
  ADD COLUMN "template_fields" jsonb;

COMMENT ON COLUMN "Assets"."template_key" IS
  'Asset template kind. NULL = legacy asset (uses *Details subtable). NOT NULL = template-based (uses template_fields jsonb).';

COMMENT ON COLUMN "Assets"."template_fields" IS
  'User-entered field values keyed by the field name declared in lib/assetTemplates.ts. Only meaningful when template_key IS NOT NULL.';
