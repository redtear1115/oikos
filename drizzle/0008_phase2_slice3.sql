-- Phase 2 Slice 3: 愛物擴展（pet + plant enum values）

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pet'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'asset_type')) THEN
    ALTER TYPE asset_type ADD VALUE 'pet';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'plant'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'asset_type')) THEN
    ALTER TYPE asset_type ADD VALUE 'plant';
  END IF;
END $$;
