CREATE TABLE IF NOT EXISTS "user_tutorial" (
	"auth_user_id" uuid NOT NULL,
	"tutorial_key" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_tutorial_auth_user_id_tutorial_key_pk" PRIMARY KEY("auth_user_id","tutorial_key")
);
