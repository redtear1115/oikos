import {
  pgTable, pgEnum, uuid, text, integer, numeric,
  timestamp, date, jsonb,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const splitTypeEnum = pgEnum('split_type', ['all_mine', 'all_theirs', 'half'])
export const assetTypeEnum = pgEnum('asset_type', ['car', 'house', 'child', 'insurance', 'pet', 'plant'])
// '92' is legacy from Phase 0; pg can't drop enum values, so kept here even though UI only offers 95/98/diesel/electric.
export const fuelTypeEnum = pgEnum('fuel_type', ['92', '95', '98', 'diesel', 'electric'])
export const genderEnum = pgEnum('gender', ['male', 'female', 'other'])
export const insuredTypeEnum = pgEnum('insured_type', ['user', 'child'])
export const invoiceCredentialStatusEnum = pgEnum('invoice_credential_status', ['active', 'invalid', 'revoked'])
export const invoiceImportRunStatusEnum = pgEnum(
  'invoice_import_run_status',
  ['fetching', 'preview', 'committed', 'failed', 'cancelled'],
)

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
})

export const groupInvites = pgTable('GroupInvites', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  invitedBy: uuid('invited_by').notNull().references(() => profiles.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
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
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const cashTransactions = pgTable('CashTransactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  paidBy: uuid('paid_by').notNull().references(() => profiles.id),
  amount: integer('amount').notNull(),
  splitType: splitTypeEnum('split_type').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  assetId: uuid('asset_id').references(() => assets.id),
  fuelLogId: uuid('fuel_log_id').references(() => fuelLogs.id),
  invoiceNumber: text('invoice_number'),
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
