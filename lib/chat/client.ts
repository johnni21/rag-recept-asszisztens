import type { UIMessage } from 'ai';
import { z } from 'zod';

const messageSchema = z.custom<UIMessage>(value => {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return (
    typeof message.id === 'string' &&
    message.id.length > 0 &&
    (message.role === 'user' || message.role === 'assistant') &&
    Array.isArray(message.parts) &&
    message.parts.every(
      part =>
        part !== null &&
        typeof part === 'object' &&
        'type' in part &&
        typeof part.type === 'string',
    )
  );
});

const conversationFields = {
  id: z.string(),
  title: z.string(),
  revision: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
};

const conversationSchema = z.object({
  ...conversationFields,
  messages: z.array(messageSchema),
});

const summarySchema = z.object({
  ...conversationFields,
  messageCount: z.number().int().min(0),
});

const conversationResponseSchema = z.object({
  success: z.literal(true),
  conversation: conversationSchema,
});

const listResponseSchema = z.object({
  success: z.literal(true),
  conversations: z.array(summarySchema),
});

export type SavedConversation = z.infer<
  typeof conversationSchema
>;

export type ConversationSummary = z.infer<
  typeof summarySchema
>;

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
  });

  if (response.ok === false) {
    if (response.status === 404) {
      throw new Error('A beszélgetés nem található.');
    }

    if (response.status === 409) {
      throw new Error(
        'A beszélgetés megváltozott. Töltsd újra a folytatáshoz.',
      );
    }

    throw new Error('A művelet sikertelen. Próbáld újra.');
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new Error('A szerver válasza nem olvasható.');
  }

  const parsed = schema.safeParse(body);

  if (parsed.success === false) {
    throw new Error('A szerver válaszának formátuma hibás.');
  }

  return parsed.data;
}

export const listConversations = async () => {
  const data = await requestJson(
    '/api/conversations',
    listResponseSchema,
  );

  return data.conversations;
};

export const createConversation = async () => {
  const data = await requestJson(
    '/api/conversations',
    conversationResponseSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );

  return data.conversation;
};

export const getConversation = async (id: string) => {
  const data = await requestJson(
    '/api/conversations/' + encodeURIComponent(id),
    conversationResponseSchema,
  );

  return data.conversation;
};

export const deleteConversation = async (id: string) => {
  await requestJson(
    '/api/conversations/' + encodeURIComponent(id),
    z.object({ success: z.literal(true) }),
    { method: 'DELETE' },
  );
};
