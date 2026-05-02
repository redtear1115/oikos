CREATE TYPE "public"."asset_type" AS ENUM('car', 'house', 'child', 'insurance');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('92', '95', '98', 'diesel');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."insured_type" AS ENUM('user', 'child');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('all_mine', 'all_theirs', 'half');--> statement-breakpoint
CREATE TABLE "Assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"type" "asset_type" NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CarDetails" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"plate" text NOT NULL,
	"purchased_at" date,
	"purchase_price" integer
);
--> statement-breakpoint
CREATE TABLE "CashTransactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"paid_by" uuid NOT NULL,
	"amount" integer NOT NULL,
	"split_type" "split_type" NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"asset_id" uuid,
	"invoice_number" text,
	"transacted_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChildDetails" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"birthday" date,
	"gender" "gender",
	"id_number_encrypted" text,
	"insurance_id_encrypted" text
);
--> statement-breakpoint
CREATE TABLE "FuelLogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"liters" integer NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"odometer" integer NOT NULL,
	"price_per_liter" integer NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "GroupBalance" (
	"group_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"last_calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "GroupInvites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "GroupInvites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "HouseDetails" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"owner" uuid NOT NULL,
	"address" text,
	"purchased_at" date,
	"purchase_price" integer
);
--> statement-breakpoint
CREATE TABLE "InsuranceDetails" (
	"asset_id" uuid PRIMARY KEY NOT NULL,
	"policy_number" text,
	"insurance_type" text,
	"coverage_amount" integer,
	"payment_date" integer,
	"expiry_date" date,
	"insured_type" "insured_type" NOT NULL,
	"insured_user_id" uuid,
	"insured_child_id" uuid
);
--> statement-breakpoint
CREATE TABLE "InvoiceCredentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"verification_code_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "OikosGroups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"member_a" uuid NOT NULL,
	"member_b" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"paid_by" uuid NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"settled_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Assets" ADD CONSTRAINT "Assets_group_id_OikosGroups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."OikosGroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CarDetails" ADD CONSTRAINT "CarDetails_asset_id_Assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CashTransactions" ADD CONSTRAINT "CashTransactions_group_id_OikosGroups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."OikosGroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CashTransactions" ADD CONSTRAINT "CashTransactions_paid_by_Profiles_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CashTransactions" ADD CONSTRAINT "CashTransactions_asset_id_Assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ChildDetails" ADD CONSTRAINT "ChildDetails_asset_id_Assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FuelLogs" ADD CONSTRAINT "FuelLogs_asset_id_Assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GroupBalance" ADD CONSTRAINT "GroupBalance_group_id_OikosGroups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."OikosGroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GroupInvites" ADD CONSTRAINT "GroupInvites_group_id_OikosGroups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."OikosGroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "GroupInvites" ADD CONSTRAINT "GroupInvites_invited_by_Profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HouseDetails" ADD CONSTRAINT "HouseDetails_asset_id_Assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HouseDetails" ADD CONSTRAINT "HouseDetails_owner_Profiles_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InsuranceDetails" ADD CONSTRAINT "InsuranceDetails_asset_id_Assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InsuranceDetails" ADD CONSTRAINT "InsuranceDetails_insured_user_id_Profiles_id_fk" FOREIGN KEY ("insured_user_id") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InsuranceDetails" ADD CONSTRAINT "InsuranceDetails_insured_child_id_Assets_id_fk" FOREIGN KEY ("insured_child_id") REFERENCES "public"."Assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InvoiceCredentials" ADD CONSTRAINT "InvoiceCredentials_group_id_OikosGroups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."OikosGroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "InvoiceCredentials" ADD CONSTRAINT "InvoiceCredentials_user_id_Profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "OikosGroups" ADD CONSTRAINT "OikosGroups_member_a_Profiles_id_fk" FOREIGN KEY ("member_a") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "OikosGroups" ADD CONSTRAINT "OikosGroups_member_b_Profiles_id_fk" FOREIGN KEY ("member_b") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Settlements" ADD CONSTRAINT "Settlements_group_id_OikosGroups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."OikosGroups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Settlements" ADD CONSTRAINT "Settlements_paid_by_Profiles_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."Profiles"("id") ON DELETE no action ON UPDATE no action;