CREATE TABLE IF NOT EXISTS "staff_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_store_staff_id_store_id_unique" UNIQUE("staff_id","store_id")
);
--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_store_id_store_id_fk";
--> statement-breakpoint
ALTER TABLE "tip" ADD COLUMN IF NOT EXISTS "membership_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_store" ADD CONSTRAINT "staff_store_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_store" ADD CONSTRAINT "staff_store_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tip" ADD CONSTRAINT "tip_membership_id_staff_store_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."staff_store"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- 既存データ移行: 既存 staff が持つ store_id を staff_store（所属）へ1件ずつ移し替える。
-- 二重所属（一意制約）に当たる行はスキップする（冪等・再実行安全）。
INSERT INTO "staff_store" ("staff_id", "store_id", "created_at")
SELECT s."id", s."store_id", s."created_at"
FROM "staff" s
WHERE s."store_id" IS NOT NULL
ON CONFLICT ("staff_id", "store_id") DO NOTHING;
--> statement-breakpoint
-- 既存 tip に membership_id を埋める（staff_id + store_id で対応する所属を引き当てる）。
-- 既存 tip の staff_id / store_id はそのまま保持する（文脈の固定保存）。
UPDATE "tip" t
SET "membership_id" = ss."id"
FROM "staff_store" ss
WHERE ss."staff_id" = t."staff_id"
  AND ss."store_id" = t."store_id"
  AND t."membership_id" IS NULL;
--> statement-breakpoint
-- 移行が済んだので staff から store_id を撤去する（所属は staff_store が真実の源泉）。
ALTER TABLE "staff" DROP COLUMN IF EXISTS "store_id";--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_auth_user_id_unique" UNIQUE("auth_user_id");
