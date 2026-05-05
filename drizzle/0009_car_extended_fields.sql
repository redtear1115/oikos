-- Car extended fields: color, year, brand, model, initial_odometer
ALTER TABLE "CarDetails"
  ADD COLUMN IF NOT EXISTS color       text,
  ADD COLUMN IF NOT EXISTS year        integer,
  ADD COLUMN IF NOT EXISTS brand       text,
  ADD COLUMN IF NOT EXISTS model       text,
  ADD COLUMN IF NOT EXISTS initial_odometer integer;
