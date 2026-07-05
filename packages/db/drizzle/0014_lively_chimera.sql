ALTER TABLE "webhook_event" ALTER COLUMN "processed_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "webhook_event" ALTER COLUMN "processed_at" DROP NOT NULL;