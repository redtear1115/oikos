-- Insurance ↔ Vehicle linkage: add nullable vehicleId FK on InsuranceDetails
ALTER TABLE "InsuranceDetails"
  ADD COLUMN IF NOT EXISTS "vehicle_id" uuid
    REFERENCES "Assets"("id") ON DELETE SET NULL;
