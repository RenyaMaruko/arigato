CREATE TABLE IF NOT EXISTS "payout_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"balance_transaction_id" text,
	"stripe_charge_id" text,
	"tip_id" uuid,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tip" ADD COLUMN "stripe_charge_id" text;--> statement-breakpoint
ALTER TABLE "tip" ADD COLUMN "balance_transaction_id" text;--> statement-breakpoint
ALTER TABLE "tip" ADD COLUMN "available_on" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tip" ADD COLUMN "bt_status" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_ledger" ADD CONSTRAINT "payout_ledger_payout_id_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
