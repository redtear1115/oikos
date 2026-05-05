import {
  pgTable, pgEnum, uuid, text, integer, numeric,
  timestamp, date,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ─── Enums ───────────────────────────────────────────────────────────────────

export const splitTypeEnum = pgEnum('split_type', ['all_mine', 'all_theirs', 'half'])
export const assetTypeEnum = pgEnum('asset_type', ['car', 'house', 'child', 'insurance'])
// Note: '92' is a legacy enum value left over from Phase 0; postgres can't easily
// drop enum values, so we keep it in the schema even though current UI only
// surfaces 95 / 98 / diesel / electric (per Phase 2 Slice 2 spec).
export const fuelTypeEnum = pgEnum('fuel_type', ['92', '95', '98', 'diesel', 'electric'])
export const genderEnum = pgEnum('gender', ['male', 'female', 'other'])
export const insuredTypeEnum = pgEnum('insured_type', ['user', 'child'])

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
})

export const invoiceCredentials = pgTable('InvoiceCredentials', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid('group_id').notNull().references(() => oikosGroups.id),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  barcode: text('barcode').notNull(),
  verificationCodeEncrypted: text('verification_code_encrypted').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
