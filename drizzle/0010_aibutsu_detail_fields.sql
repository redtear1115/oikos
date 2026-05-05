-- Aibutsu extended fields: child extras, pet table, insurance extras

-- ChildDetails: add nickname / hospital / blood_type / height_cm / weight_g
ALTER TABLE "ChildDetails"
  ADD COLUMN IF NOT EXISTS nickname      text,
  ADD COLUMN IF NOT EXISTS hospital      text,
  ADD COLUMN IF NOT EXISTS blood_type    text,
  ADD COLUMN IF NOT EXISTS height_cm     integer,
  ADD COLUMN IF NOT EXISTS weight_g      integer;

-- PetDetails: brand-new table
CREATE TABLE IF NOT EXISTS "PetDetails" (
  asset_id       uuid PRIMARY KEY REFERENCES "Assets"(id),
  species        text,
  breed          text,
  sex            text,
  birth_date     date,
  adopted_date   date,
  purchase_cost  integer,
  weight_g       integer,
  chip_no        text,
  vet            text
);

-- InsuranceDetails: add insurer / annual_premium / pay_cycle / starts_at / term_years / sum_insured
ALTER TABLE "InsuranceDetails"
  ADD COLUMN IF NOT EXISTS insured       text,
  ADD COLUMN IF NOT EXISTS insurer       text,
  ADD COLUMN IF NOT EXISTS annual_premium integer,
  ADD COLUMN IF NOT EXISTS pay_cycle     text,
  ADD COLUMN IF NOT EXISTS starts_at     date,
  ADD COLUMN IF NOT EXISTS term_years    integer,
  ADD COLUMN IF NOT EXISTS sum_insured   integer;
