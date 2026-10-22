CREATE TABLE IF NOT EXISTS "chat_metrics" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(191) NOT NULL,
	"message_id" varchar(191) NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"first_text_ms" integer,
	"generation_ms" integer,
	"total_ms" integer NOT NULL,
	"usage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_cost_usd" numeric(18, 10),
	"pricing_version" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
