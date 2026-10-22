import type { UIMessage } from 'ai';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema/conversations';

export class ConversationConflictError extends Error {
  constructor() {
    super('The conversation changed. Reload it before continuing.');
    this.name = 'ConversationConflictError';
  }
}

export const loadConversation = async (id: string) => {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  return conversation ?? null;
};

const titleFromMessages = (messages: UIMessage[]): string => {
  const firstUserMessage = messages.find(
    message => message.role === 'user',
  );

  const text = firstUserMessage?.parts
    .flatMap(part =>
      part.type === 'text' ? [part.text] : [],
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, 200) : 'Új beszélgetés';
};

export const saveConversationMessages = async ({
  id,
  expectedRevision,
  messages,
}: {
  id: string;
  expectedRevision: number;
  messages: UIMessage[];
}) => {
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error('Invalid conversation revision.');
  }

  if (!Array.isArray(messages)) {
    throw new Error('Messages must be an array.');
  }

  const messageIds = messages.map(message => message.id);

  if (new Set(messageIds).size !== messageIds.length) {
    throw new Error('Duplicate message IDs.');
  }

  const [saved] = await db
    .update(conversations)
    .set({
      messages: sql`${JSON.stringify(messages)}::text::jsonb`,
      title: titleFromMessages(messages),
      revision: sql`${conversations.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.revision, expectedRevision),
      ),
    )
    .returning();

  if (saved === undefined) {
    throw new ConversationConflictError();
  }

  return saved;
};