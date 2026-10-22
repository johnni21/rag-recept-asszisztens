import type { UIMessage } from 'ai';
import { sql } from 'drizzle-orm';
import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import { nanoid } from '@/lib/utils';

export const conversations = pgTable('conversations', {
  id: varchar('id', { length: 191 })
    .primaryKey()
    .$defaultFn(() => nanoid()),

  title: varchar('title', { length: 200 })
    .notNull()
    .default('Új beszélgetés'),

  messages: jsonb('messages')
    .$type<UIMessage[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),

  revision: integer('revision')
    .notNull()
    .default(0),

  createdAt: timestamp('created_at', {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),

  updatedAt: timestamp('updated_at', {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});
