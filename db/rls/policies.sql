-- Enable RLS on all tables
ALTER TABLE "Profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OikosGroups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupInvites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashTransactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CarDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FuelLogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HouseDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChildDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InsuranceDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceCredentials" ENABLE ROW LEVEL SECURITY;

-- Profiles: user can read own + partner's profile
CREATE POLICY "profiles_select" ON "Profiles" FOR SELECT USING (
  id = auth.uid() OR id IN (
    SELECT member_a FROM "OikosGroups" WHERE member_b = auth.uid()
    UNION
    SELECT member_b FROM "OikosGroups" WHERE member_a = auth.uid()
  )
);

-- OikosGroups: group members can read
CREATE POLICY "groups_select" ON "OikosGroups" FOR SELECT USING (
  member_a = auth.uid() OR member_b = auth.uid()
);

-- GroupBalance: group members can read
CREATE POLICY "balance_select" ON "GroupBalance" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "GroupBalance".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- CashTransactions: group members can read non-deleted
CREATE POLICY "transactions_select" ON "CashTransactions" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "CashTransactions".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- Settlements: group members can read non-deleted
CREATE POLICY "settlements_select" ON "Settlements" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "Settlements".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- Assets: group members can read non-deleted
CREATE POLICY "assets_select" ON "Assets" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "Assets".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- Detail tables: accessible if parent asset is accessible
CREATE POLICY "car_details_select" ON "CarDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "CarDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "fuel_logs_select" ON "FuelLogs" FOR SELECT USING (
  deleted_at IS NULL AND
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "FuelLogs".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "house_details_select" ON "HouseDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "HouseDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "child_details_select" ON "ChildDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "ChildDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

CREATE POLICY "insurance_details_select" ON "InsuranceDetails" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "Assets" a JOIN "OikosGroups" g ON g.id = a.group_id
    WHERE a.id = "InsuranceDetails".asset_id AND a.deleted_at IS NULL
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);

-- GroupInvites: creator can read
CREATE POLICY "invites_select" ON "GroupInvites" FOR SELECT USING (
  invited_by = auth.uid()
);

-- InvoiceCredentials: group members can read
CREATE POLICY "invoice_creds_select" ON "InvoiceCredentials" FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM "OikosGroups" g
    WHERE g.id = "InvoiceCredentials".group_id
    AND (g.member_a = auth.uid() OR g.member_b = auth.uid())
  )
);
