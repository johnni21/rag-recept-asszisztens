CREATE TABLE IF NOT EXISTS "conversations" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"title" varchar(200) DEFAULT 'Új beszélgetés' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
