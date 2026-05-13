import {
  pgTable, pgEnum, uuid, text, integer, numeric,
  timestamp, date, jsonb, boolean,
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

export const assets = pgTable('Assets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  type: assetTypeEnum('type').notNull(),
  name: text('name').notNull(),
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
  plate: text('plate').notNull(),
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
  address: text('address'),
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
