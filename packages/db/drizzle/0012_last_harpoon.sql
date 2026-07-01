CREATE TABLE IF NOT EXISTS "store_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "store_admin_store_id_auth_user_id_unique" UNIQUE("store_id","auth_user_id")
);
--> statement-breakpoint
ALTER TABLE "store" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "store_admin" ADD CONSTRAINT "store_admin_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "store_admin_one_active_owner_per_store" ON "store_admin" USING btree ("store_id") WHERE role = 'owner' AND left_at IS NULL;