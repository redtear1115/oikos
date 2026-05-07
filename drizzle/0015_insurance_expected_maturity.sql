-- Insurance: add expected_maturity_amount for savings framing (v0.8.0)
-- 使用者預估的滿期金 / 還本總額（單位：TWD）
-- null = 未設定，UI 不顯示「預估剩餘」進度條
ALTER TABLE "InsuranceDetails"
  ADD COLUMN IF NOT EXISTS "expected_maturity_amount" integer;

COMMENT ON COLUMN "InsuranceDetails"."expected_maturity_amount" IS
  'User-set expected maturity / payback total (TWD). null = unset.';
