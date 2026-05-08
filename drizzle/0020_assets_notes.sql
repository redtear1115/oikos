-- PR #6 — Add freeform notes to Assets.
--
-- Single nullable text column on Assets, rendered as a multi-line textarea in
-- the AssetSheet form and as a small section on every asset detail page.
-- Treated as metadata on the asset row (UPDATE in place; not soft-delete-and-
-- insert), consistent with the existing assets.name update pattern.

ALTER TABLE "Assets" ADD COLUMN "notes" text;
