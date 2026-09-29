DO $$ BEGIN
 CREATE TYPE "public"."resource_status" AS ENUM('uploaded', 'processing', 'processed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN "chunk_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "embeddings" ADD COLUMN "section" varchar(100);--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "file_name" varchar(255) DEFAULT 'manual-entry.txt' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "file_type" varchar(10) DEFAULT 'txt' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "file_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "status" "resource_status" DEFAULT 'uploaded' NOT NULL;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
