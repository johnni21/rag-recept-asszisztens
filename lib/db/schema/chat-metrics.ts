import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import type { UsageEvent } from '@/lib/monitoring/usage';
import { nanoid } from '@/lib/utils';

export type ChatMetricOutcome =
  | 'saved'
  | 'not-saved'
  | 'save-failed';

export const chatMetrics = pgTable('chat_metrics', {
  id: varchar('id', { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),

  conversationId: varchar('conversation_id', {
    length: 191,
  }).notNull(),

  messageId: varchar('message_id', {
    length: 191,
  }).notNull(),

  outcome: varchar('outcome', {
    length: 20,
  })
    .$type<ChatMetricOutcome>()
    .notNull(),

  firstTextMs: integer('first_text_ms'),

  generationMs: integer('generation_ms'),

  totalMs: integer('total_ms').notNull(),

  usage: jsonb('usage')
    .$type<UsageEvent[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  estimatedCostUsd: numeric('estimated_cost_usd', {
    precision: 18,
    scale: 10,
  }),

  pricingVersion: varchar('pricing_version', {
    length: 100,
  }),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});