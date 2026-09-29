import { sql } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  vector,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { nanoid } from "@/lib/utils";

export const resourceStatusEnum = pgEnum("resource_status", [
  "uploaded",
  "processing",
  "processed",
  "failed",
]);

export const resources = pgTable("resources", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  fileName: varchar("file_name", { length: 255 })
    .notNull()
    .default("manual-entry.txt"),
  fileType: varchar("file_type", { length: 10 })
    .notNull()
    .default("txt"),
  fileSize: integer("file_size")
    .notNull()
    .default(0),
  content: text("content").notNull(),
  status: resourceStatusEnum("status")
    .notNull()
    .default("uploaded"),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at")
    .notNull()
    .default(sql`now()`),
});

export const embeddings = pgTable("embeddings", {
  id: varchar("id", { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),
  resourceId: varchar("resource_id", { length: 191 })
    .notNull()
    .references(() => resources.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index")
    .notNull()
    .default(0),
  section: varchar("section", { length: 100 }),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
});
