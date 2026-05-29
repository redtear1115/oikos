import {
  pgTable, pgEnum, uuid, text, integer, numeric,
  timestamp, date, jsonb, boolean, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const splitTypeEnum = pgEnum('split_type', ['all_mine', 'all_theirs', 'half', 'weighted'])
// 'item' is the asset type used by template-based assets (#222). Legacy
// detail subtables (CarDetails / HouseDetails / etc.) only apply to the
// other six values.
export const assetTypeEnum = pgEnum('asset_type', ['car', 'house', 'child', 'insurance', 'pet', 'plant', 'item'])
// #222 — template kind for new lightweight, free-text assets. NULL on the
// Assets row = legacy path; NOT NULL = template path (template_fields jsonb
// holds the user-entered values keyed by lib/assetTemplates.ts definitions).
// v1 ships only `general`; the enum is appendable for future templates.
export const assetTemplateKeyEnum = pgEnum('asset_template_key', ['general'])
// '92' is legacy from Phase 0; pg can't drop enum values, so kept here even though UI only offers 95/98/diesel/electric.
export const fuelTypeEnum = pgEnum('fuel_type', ['92', '95', '98', 'diesel', 'electric'])
export const genderEnum = pgEnum('gender', ['male', 'female', 'other'])
export const insuredTypeEnum = pgEnum('insured_type', ['user', 'child'])
export const invoiceCredentialStatusEnum = pgEnum('invoice_credential_status', ['active', 'invalid', 'revoked'])
export const invoiceImportRunStatusEnum = pgEnum(
  'invoice_import_run_status',
  ['fetching', 'preview', 'committed', 'failed', 'cancelled'],
)
// Per-record lifecycle. 'pending' = 已承諾但未扣款 (credit-card slip / IOU);
// excluded from GroupBalance until promoted to 'settled'. See drizzle/0028.
export const recordStatusEnum = pgEnum('record_status', ['settled', 'pending'])
// #68 — Multi-currency support. 'twd' is the default base currency.
// Extendable: append values here + matching migration ALTER TYPE.
export const currencyEnum = pgEnum('currency_code', ['twd', 'cny', 'usd', 'jpy'])
// #42 — Trip sub-ledger lifecycle.
export const tripStatusEnum = pgEnum('trip_status', ['active', 'ended', 'archived'])

// ─── Tables ──────────────────────────────────────────────────────────────────

export const profiles = pgTable('Profiles', {
  id: uuid('id').primaryKey(), // mirrors auth.users.id
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  defaultSplitType: splitTypeEnum('default_split_type').notNull().default('half'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const oikosGroups = pgTable('OikosGroups', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  memberA: uuid('member_a').notNull().references(() => profiles.id),
  memberB: uuid('member_b').references(() => profiles.id), // null until invite accepted
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  defaultSplitRatioA: integer('default_split_ratio_a'),
  // #79 — pending member_a/member_b swap proposal. Both fields go together.
  pendingSwapProposedBy: uuid('pending_swap_proposed_by').references(() => profiles.id),
  pendingSwapExpiresAt: timestamp('pending_swap_expires_at', { withTimezone: true }),
  // #79 — epoch marker: bumped on swap / leave / new partner join.
  // Downstream features filter timeline + stats by current epoch.
  currentEpochStartedAt: timestamp('current_epoch_started_at', { withTimezone: true })
    .defaultNow().notNull(),
  // #220 — Guardian (守護) module is paywalled in the long run; per-group
  // beta opt-in until subscription ships. Gate via lib/guardian.ts#canAccessGuardian.
  guardianBetaEnabled: boolean('guardian_beta_enabled').notNull().default(false),
  // #68 — Per-group base currency. Locked once any record exists in the current
  // epoch. Lock rule enforced in actions/currency.ts, not at the DB layer.
  baseCurrency: currencyEnum('base_currency').notNull().default('twd'),
})

/**
 * History of relationship chapters on a ledger. One open row (`endedAt IS NULL`)
 * per group at all times — that's the current epoch. Prior rows have `endedAt`
 * set to when the *next* chapter opened.
 *
 * Rows are written from `acceptInvite` (close solo, open duo) and `leaveGroup`
 * (close duo, open solo on both sides). `confirmSwap` does NOT touch this
 * table — swap relabels members without bumping the chapter (per spec).
 */
export const groupEpochs = pgTable('GroupEpochs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  memberAId: uuid('member_a_id').notNull().references(() => profiles.id),
  memberBId: uuid('member_b_id').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const groupInvites = pgTable('GroupInvites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  invitedBy: uuid('invited_by').notNull().references(() => profiles.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  // #79 — stamped by leaveGroup so any in-flight invites can't bring a
  // new member into a now-solo group with stale assumptions.
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const groupBalance = pgTable('GroupBalance', {
  groupId: uuid('group_id').primaryKey().references(() => oikosGroups.id),
  balance: integer('balance').notNull().default(0),
  version: integer('version').notNull().default(0),
  lastCalculatedAt: timestamp('last_calculated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ⚠️ Deprecated since #410 (v0.17.4): trip-scoped rates moved into
// Trips.rate_snapshot. This table is retained for historical compatibility of
// legacy trips whose rate_snapshot was hydrated from it; new trips no longer
// read from here. Drop migration scheduled in a future cleanup pass.
//
// #68 — Per-group psychological exchange rates. Composite PK (group_id, from, to).
// Rate semantics: 1 display unit of from_currency = rate display units of to_currency.
// 4×4 matrix covers twd/cny/usd/jpy. CHECK from <> to enforced in migration SQL.
export const currencyRates = pgTable('CurrencyRates', {
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id, { onDelete: 'cascade' }),
  fromCurrency: currencyEnum('from_currency').notNull(),
  toCurrency: currencyEnum('to_currency').notNull(),
  rate: numeric('rate', { precision: 10, scale: 3 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.groupId, t.fromCurrency, t.toCurrency] }),
}))

export const assets = pgTable('Assets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  type: assetTypeEnum('type').notNull(),
  // For child assets (#826), `name` is the display nickname (e.g. 「小白」);
  // the real full name lives encrypted in `name_encrypted` and is only
  // surfaced through a tap-to-reveal flow in the detail card. For every
  // other asset type, `name` is the display name and `name_encrypted` stays
  // NULL — same column reused so callers don't need a type discriminator.
  name: text('name').notNull(),
  nameEncrypted: text('name_encrypted'),
  notes: text('notes'),
  // #222 — template path. NULL = legacy (uses *Details subtable + the matching
  // legacy *SheetBody). NOT NULL = template-based (free-text fields stored in
  // template_fields jsonb, type is always 'item').
  templateKey: assetTemplateKeyEnum('template_key'),
  templateFields: jsonb('template_fields'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cashTransactions = pgTable('CashTransactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  splitType: splitTypeEnum('split_type').notNull(),
  splitRatioA: integer('split_ratio_a'),
  description: text('description').notNull(),
  category: text('category').notNull(),
  notes: text('notes'),
  assetId: uuid('asset_id').references(() => assets.id),
  fuelLogId: uuid('fuel_log_id').references(() => fuelLogs.id),
  invoiceNumber: text('invoice_number'),
  status: recordStatusEnum('status').notNull().default('settled'),
  transactedAt: timestamp('transacted_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // #68 — Multi-currency. NULL = native base-currency write.
  // Tuple (original_currency, original_amount, rate_snapshot) is all-or-nothing
  // — enforced by CHECK constraint in migration SQL. `amount` always stores the
  // base-currency integer. rate_snapshot is locked at write time (snapshot semantics).
  originalCurrency: currencyEnum('original_currency'),
  originalAmount: integer('original_amount'),
  rateSnapshot: numeric('rate_snapshot', { precision: 10, scale: 3 }),
  // #42 — Trip sub-ledger tag. NULL = no trip.
  tripId: uuid('trip_id').references(() => trips.id),
  // #556 — CSV import audit + rollback. NULL = not from an import.
  // FK to ImportBatches; lets a batch be undone by deleting rows that share this id.
  importBatchId: uuid('import_batch_id').references(() => importBatches.id),
})

export const settlements = pgTable('Settlements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  note: text('note'),
  settledAt: timestamp('settled_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const carDetails = pgTable('CarDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  // `plate` carries the legacy plain value during the encryption rollout (#826).
  // New writes go to `plate_encrypted`; reads go through the reveal action.
  // `plate` is kept notNull for the transition window — backfill script
  // (`scripts/encrypt-existing-pii.mjs`) populates `plate_encrypted` from
  // the existing `plate` value. A follow-up migration drops `plate` once all
  // environments are confirmed migrated.
  plate: text('plate').notNull(),
  plateEncrypted: text('plate_encrypted'),
  purchasedAt: date('purchased_at'),
  purchasePrice: integer('purchase_price'),
  primaryUserId: uuid('primary_user_id').references(() => profiles.id), // NULL = 共用
  fuelType: fuelTypeEnum('fuel_type').notNull().default('95'),
  color: text('color'),
  year: integer('year'),
  brand: text('brand'),
  model: text('model'),
  initialOdometer: integer('initial_odometer'),
})

export const fuelLogs = pgTable('FuelLogs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  liters: numeric('liters', { precision: 6, scale: 2 }).notNull(),
  fuelType: fuelTypeEnum('fuel_type').notNull(),
  odometer: integer('odometer').notNull(),
  station: text('station'),
  loggedAt: timestamp('logged_at', { withTimezone: true }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const houseDetails = pgTable('HouseDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  owner: uuid('owner').notNull().references(() => profiles.id),
  // `address` carries the legacy plain value during the encryption rollout
  // (#826). New writes go to `address_encrypted`; reads go through the
  // reveal action. Follow-up migration drops `address` once migrated.
  address: text('address'),
  addressEncrypted: text('address_encrypted'),
  purchasedAt: date('purchased_at'),
  purchasePrice: integer('purchase_price'),
})

export const childDetails = pgTable('ChildDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  birthday: date('birthday'),
  gender: genderEnum('gender'),
  idNumberEncrypted: text('id_number_encrypted'),
  insuranceIdEncrypted: text('insurance_id_encrypted'),
  nickname: text('nickname'),
  hospital: text('hospital'),
  bloodType: text('blood_type'),
  heightCm: integer('height_cm'),
  weightG: integer('weight_g'),
})

export const petDetails = pgTable('PetDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  species: text('species'),
  breed: text('breed'),
  sex: text('sex'),
  birthDate: date('birth_date'),
  adoptedDate: date('adopted_date'),
  purchaseCost: integer('purchase_cost'),
  weightG: integer('weight_g'),
  chipNo: text('chip_no'),
  vet: text('vet'),
})

export const plantDetails = pgTable('PlantDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  species: text('species'),
  location: text('location'),
  sproutedAt: date('sprouted_at'),
  cost: integer('cost'),
  waterEvery: integer('water_every'),
})

export const insuranceDetails = pgTable('InsuranceDetails', {
  assetId: uuid('asset_id').primaryKey().references(() => assets.id),
  policyNumber: text('policy_number'),
  insuranceType: text('insurance_type'),
  coverageAmount: integer('coverage_amount'),
  paymentDate: integer('payment_date'),
  expiryDate: date('expiry_date'),
  insuredType: insuredTypeEnum('insured_type').notNull(),
  insuredUserId: uuid('insured_user_id').references(() => profiles.id),
  insuredChildId: uuid('insured_child_id').references(() => assets.id),
  insured: text('insured'),
  insurer: text('insurer'),
  annualPremium: integer('annual_premium'),
  payCycle: text('pay_cycle'),
  startsAt: date('starts_at'),
  termYears: integer('term_years'),
  sumInsured: integer('sum_insured'),
  vehicleId: uuid('vehicle_id').references(() => assets.id),  // optional vehicle link (car insurance)
  expectedMaturityAmount: integer('expected_maturity_amount'),  // savings framing: user-set 預估滿期金
  // v0.15.2 #166 — current account value for investment-linked savings policies.
  // User-set, statement-based; not derived. null = unset or not applicable.
  accountValue: integer('account_value'),
  // v0.15.0 #127 — red-badge threshold for single-year policies (warning stays at 60d).
  // Multi-year / savings policies ignore this at render time.
  reminderDaysBefore: integer('reminder_days_before').notNull().default(30),
  // v0.15.0 #142 — 要保人 (policy holder). Always one of the group's members,
  // so we bind to Profiles via FK. Distinct from `insured` (被保人, text) which
  // can be anyone, including relatives outside the group.
  policyHolderUserId: uuid('policy_holder_user_id').references(() => profiles.id),
})

export const invoiceCredentials = pgTable('InvoiceCredentials', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  barcode: text('barcode').notNull(),
  verificationCodeEncrypted: text('verification_code_encrypted').notNull(),
  // v0.9.0 additions:
  nickname: text('nickname'),
  status: invoiceCredentialStatusEnum('status').notNull().default('active'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Per-invoice diff base. invoice_number is globally unique nationwide. Server-only.
export const invoiceImportSnapshots = pgTable('InvoiceImportSnapshots', {
  invoiceNumber: text('invoice_number').primaryKey(),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  importedAmount: integer('imported_amount').notNull(),
  importedDescription: text('imported_description').notNull(),
  importedCategory: text('imported_category').notNull(),
  invoiceDate: date('invoice_date').notNull(),
  merchantName: text('merchant_name').notNull(),
  raw: jsonb('raw'),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).defaultNow().notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
})

// Audit log + debounce for each "click 匯入發票" action.
export const invoiceImportRuns = pgTable('InvoiceImportRuns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  credentialId: uuid('credential_id').notNull().references(() => invoiceCredentials.id),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  rangeStart: date('range_start').notNull(),
  rangeEnd: date('range_end').notNull(),
  status: invoiceImportRunStatusEnum('status').notNull().default('fetching'),
  fetchedCount: integer('fetched_count').notNull().default(0),
  committedCount: integer('committed_count').notNull().default(0),
  skippedDupCount: integer('skipped_dup_count').notNull().default(0),
  skippedVoidCount: integer('skipped_void_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  errorMsg: text('error_msg'),
})

export const incomeTransactions = pgTable('IncomeTransactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  recipientId: uuid('recipient_id').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  category: text('category').notNull(),
  source: text('source'),
  assetId: uuid('asset_id').references(() => assets.id),
  occurredAt: date('occurred_at').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // #68 — Multi-currency. NULL = native base-currency write. UI defers to a later phase.
  // Tuple all-or-nothing enforced by CHECK constraint in migration SQL.
  originalCurrency: currencyEnum('original_currency'),
  originalAmount: integer('original_amount'),
  rateSnapshot: numeric('rate_snapshot', { precision: 10, scale: 3 }),
  // #607 — Parallel FK to ImportBatches; mirrors CashTransactions.importBatchId.
  // NULL = not from an import. Lets batch rollback delete income + expense rows
  // atomically by shared batch id.
  importBatchId: uuid('import_batch_id').references(() => importBatches.id),
})

export const recurringIncomeRules = pgTable('RecurringIncomeRules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  recipientId: uuid('recipient_id').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  category: text('category').notNull(),
  source: text('source'),
  assetId: uuid('asset_id').references(() => assets.id),
  intervalMonths: integer('interval_months').notNull().default(1),
  dayOfMonth: integer('day_of_month').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on'),
  nextOccurrenceAt: date('next_occurrence_at').notNull(),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const pendingIncomeOccurrences = pgTable('PendingIncomeOccurrences', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  ruleId: uuid('rule_id').notNull().references(() => recurringIncomeRules.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  proposedAmount: integer('proposed_amount').notNull(),
  proposedDate: date('proposed_date').notNull(),
  skippedAt: timestamp('skipped_at', { withTimezone: true }),
  resolvedTxId: uuid('resolved_tx_id').references(() => incomeTransactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const recurringExpenseRules = pgTable('RecurringExpenseRules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  splitType: splitTypeEnum('split_type').notNull(),
  splitRatioA: integer('split_ratio_a'),
  description: text('description').notNull(),
  category: text('category').notNull(),
  assetId: uuid('asset_id').references(() => assets.id),
  intervalMonths: integer('interval_months').notNull().default(1),
  dayOfMonth: integer('day_of_month').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on'),
  nextOccurrenceAt: date('next_occurrence_at').notNull(),
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const pendingExpenseOccurrences = pgTable('PendingExpenseOccurrences', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  ruleId: uuid('rule_id').notNull().references(() => recurringExpenseRules.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  proposedAmount: integer('proposed_amount').notNull(),
  proposedDate: date('proposed_date').notNull(),
  proposedDescription: text('proposed_description').notNull(),
  proposedPaidBy: uuid('proposed_paid_by').notNull().references(() => profiles.id),
  proposedSplitType: splitTypeEnum('proposed_split_type').notNull(),
  proposedSplitRatioA: integer('proposed_split_ratio_a'),
  skippedAt: timestamp('skipped_at', { withTimezone: true }),
  resolvedTxId: uuid('resolved_tx_id').references(() => cashTransactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// v0.14.0 #44 — Monthly review snapshot. Cron predicts on the 1st 00:05
// Asia/Taipei for the previous month; values are frozen and not recomputed.
// All denormalised text columns (paid_by name / asset names) are snapshotted
// to survive future renames or soft-deletes of the source rows.
export const monthlyReviewSnapshots = pgTable('MonthlyReviewSnapshots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),

  // card 1 — most-shared category
  topCategory: text('top_category'),
  topCategoryTotal: integer('top_category_total'),

  // card 2 — single largest expense (denormalised)
  largestExpenseAmount: integer('largest_expense_amount'),
  largestExpenseDescription: text('largest_expense_description'),
  largestExpenseCategory: text('largest_expense_category'),
  largestExpensePaidByName: text('largest_expense_paid_by_name'),

  // card 3 — recurring events (income + expense), as a frozen list
  recurringEvents: jsonb('recurring_events'),
  recurringTotalIncome: integer('recurring_total_income'),
  recurringTotalExpense: integer('recurring_total_expense'),

  // card 4 — top-3 愛物 breakdown
  assetBreakdown: jsonb('asset_breakdown'),

  // per-user banner dismiss state (one snapshot row, two flags)
  bannerDismissedByMemberAAt: timestamp('banner_dismissed_by_member_a_at', { withTimezone: true }),
  bannerDismissedByMemberBAt: timestamp('banner_dismissed_by_member_b_at', { withTimezone: true }),
})

// v0.15.2 #163 — PartnerQuiz: 6 題池抽 3，兩人各自獨立作答，全部到齊後 reveal。
// One quiz per group (UNIQUE group_id) — MVP 鎖一次；未來放寬只需移除 constraint。
export const partnerQuizSessions = pgTable('PartnerQuizSessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().unique().references(() => oikosGroups.id),
  // Picked 3 keys, persisted so re-entering the answer page never re-randomises.
  // Append-only at the dictionary level — keys are static i18n config, not data.
  questionKeys: text('question_keys').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  // Written in the same transaction as the 6th answer; NULL = waiting for partner.
  revealedAt: timestamp('revealed_at', { withTimezone: true }),
})

export const partnerQuizAnswers = pgTable('PartnerQuizAnswers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: uuid('session_id').notNull().references(() => partnerQuizSessions.id),
  memberId: uuid('member_id').notNull().references(() => profiles.id),
  questionKey: text('question_key').notNull(),
  choiceKey: text('choice_key').notNull(),
  answeredAt: timestamp('answered_at', { withTimezone: true }).defaultNow().notNull(),
})

// #42 — Trip sub-ledger. Tag-style: CashTransactions.trip_id references this.
// Contained in a single epoch (epoch_id FK). start_date guard against
// currentEpochStartedAt lives in actions/trip.ts (Phase 5).
// budget_amount / budget_currency are optional user-set fields for trip planning.
// CHECK (end_date >= start_date) and CHECK ((status = 'ended') = (ended_at IS NOT NULL))
// are enforced in migration SQL (Drizzle schema layer can't express these).
// v0.17.4 #410 — rate_snapshot stores trip-scoped currencies + rates as
// `{ default: string, entries: [{ code, label, rate }] }`. Currency codes are
// free-text (uppercase by convention) to allow user-defined currencies (e.g.
// VND, EUR). default_currency / budget_currency widen to text accordingly.
// Main ledger columns (CashTransactions.original_currency etc.) stay on the
// 4-value `currency_code` enum. See lib/trip-currency.ts.
export const trips = pgTable('Trips', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  epochId: uuid('epoch_id').notNull().references(() => groupEpochs.id),
  name: text('name').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  defaultCurrency: text('default_currency'),
  budgetAmount: integer('budget_amount'),
  budgetCurrency: text('budget_currency'),
  coverPhotoUrl: text('cover_photo_url'),
  status: tripStatusEnum('status').notNull().default('active'),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  rateSnapshot: jsonb('rate_snapshot'),
})

// v0.17.2 #42 — Isolated trip ledger. Trip UI reads from here; main ledger
// (/records, stats, balance) reads CashTransactions and does NOT see these
// rows. On trip end, a summary CashTransaction is written to fold the trip
// back into the main ledger (Phase 4). split_ratio semantics: payer's share %
// (distinct from cashTransactions.split_ratio_a which is always member A's %).
export const tripExpenses = pgTable('TripExpenses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tripId: uuid('trip_id').notNull().references(() => trips.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  // v0.17.4 #410 — Free-text since trip currencies are user-defined per trip.
  // Must match an entry.code in the parent Trips.rate_snapshot (app-enforced).
  originalCurrency: text('original_currency'),
  originalAmount: integer('original_amount'),
  category: text('category').notNull(),
  splitType: splitTypeEnum('split_type').notNull(),
  splitRatio: integer('split_ratio'),
  description: text('description'),
  transactedAt: timestamp('transacted_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// #556 — CSV import metadata. One row per "用戶按匯入" action. Sibling
// InvoiceImportRuns serves the same audit role for invoice imports; kept
// separate because invoice imports have voiding / debounce semantics that
// CSV imports don't share. `source` / `status` are free-text for now — spec
// (#552) is still in flux; promote to pgEnum once values stabilise.
export const importBatches = pgTable('ImportBatches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  importedBy: uuid('imported_by').notNull().references(() => profiles.id),
  source: text('source').notNull(),
  fileName: text('file_name').notNull(),
  totalRows: integer('total_rows').notNull(),
  importedCount: integer('imported_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
})

// #556 — Per-row failure log for a batch. Lets the result page render
// "下載失敗行 CSV" without re-running the parser. `raw_row` preserves the
// original CSV cells as jsonb so the user can fix and re-upload.
export const importErrors = pgTable('ImportErrors', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  batchId: uuid('batch_id').notNull().references(() => importBatches.id, { onDelete: 'cascade' }),
  rowNumber: integer('row_number').notNull(),
  rawRow: jsonb('raw_row').notNull(),
  errorType: text('error_type').notNull(),
  errorDetail: text('error_detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const monthlyReviewMessages = pgTable('MonthlyReviewMessages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  memberId: uuid('member_id').notNull().references(() => profiles.id),
  // The month this message is *given to* (future-facing); written during the
  // preceding month while reviewing it on /review/[YYYY-MM].
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  // Stamped by month-end cron; non-null = read-only forever.
  lockedAt: timestamp('locked_at', { withTimezone: true }),
})
