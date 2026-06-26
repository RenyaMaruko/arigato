ALTER TABLE "store" ADD COLUMN "adoption_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
ALTER TABLE "store" DROP COLUMN IF EXISTS "approved_at";