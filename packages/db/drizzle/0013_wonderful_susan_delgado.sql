ALTER TABLE "staff_invite" ADD COLUMN "type" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invite" ADD COLUMN "accepted_auth_user_id" uuid;