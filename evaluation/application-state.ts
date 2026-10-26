import assert from 'node:assert/strict';

import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db';
import { chatMetrics } from '@/lib/db/schema/chat-metrics';

import { applicationRequest } from './application-http';

const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough(),
  ),
}).passthrough();

export const applicationConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  revision: z.number().int().min(0),
  messages: z.array(messageSchema),
});

export type ApplicationConversation = z.infer<
  typeof applicationConversationSchema
>;

const conversationResponseSchema = z.object({
  success: z.literal(true),
  conversation: applicationConversationSchema,
});

const contextSchema = z.object({
  fileName: z.string(),
  section: z.string().nullable(),
  content: z.string(),
});

const searchOutputSchema = z.object({
  results: z.array(contextSchema),
});

const waitForValue = async <T>(
  read: () => Promise<T | null>,
  description: string,
): Promise<T> => {
  const deadline = Date.now() + 10_000;

  while (true) {
    const value = await read();

    if (value !== null) {
      return value;
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}.`);
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }
};

export const getApplicationConversation = async (
  id: string,
): Promise<ApplicationConversation> => {
  const response = await applicationRequest(
    `/api/conversations/${encodeURIComponent(id)}`,
  );

  return conversationResponseSchema.parse(
    response.body,
  ).conversation;
};

export const createApplicationConversation = async (
  title: string,
): Promise<ApplicationConversation> => {
  const response = await applicationRequest(
    '/api/conversations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    },
    201,
  );

  return conversationResponseSchema.parse(
    response.body,
  ).conversation;
};

export const waitForApplicationTurn = async ({
  previous,
  userMessageId,
  assistantMessageId,
  answer,
}: {
  previous: ApplicationConversation;
  userMessageId: string;
  assistantMessageId: string;
  answer: string;
}): Promise<ApplicationConversation> => {
  const saved = await waitForValue(async () => {
    const current = await getApplicationConversation(
      previous.id,
    );

    return current.messages.some(
      message =>
        message.id === assistantMessageId &&
        message.role === 'assistant',
    )
      ? current
      : null;
  }, 'the saved conversation');

  assert.equal(saved.revision, previous.revision + 1);
  assert.equal(
    saved.messages.length,
    previous.messages.length + 2,
  );

  assert.deepEqual(
    saved.messages.slice(0, previous.messages.length),
    previous.messages,
    'Previously saved messages changed.',
  );

  const user = saved.messages[previous.messages.length];
  const assistant = saved.messages[previous.messages.length + 1];

  assert.equal(user.id, userMessageId);
  assert.equal(user.role, 'user');
  assert.equal(assistant.id, assistantMessageId);
  assert.equal(assistant.role, 'assistant');

  const savedAnswer = assistant.parts
    .filter(part => part.type === 'text')
    .map(part => part.text ?? '')
    .join('');

  assert.equal(
    savedAnswer,
    answer,
    'The saved answer differs from the streamed answer.',
  );

  assert.equal(
    new Set(saved.messages.map(message => message.id)).size,
    saved.messages.length,
    'Duplicate message IDs were saved.',
  );

  return saved;
};

export const waitForApplicationMetric = async (
  conversationId: string,
  messageId: string,
) => {
  return waitForValue(async () => {
    const rows = await db
      .select({
        id: chatMetrics.id,
        outcome: chatMetrics.outcome,
        firstTextMs: chatMetrics.firstTextMs,
        generationMs: chatMetrics.generationMs,
        totalMs: chatMetrics.totalMs,
        usage: chatMetrics.usage,
        estimatedCostUsd: chatMetrics.estimatedCostUsd,
        pricingVersion: chatMetrics.pricingVersion,
        storedType: sql<string>`
          jsonb_typeof(${chatMetrics.usage})
        `,
      })
      .from(chatMetrics)
      .where(
        and(
          eq(chatMetrics.conversationId, conversationId),
          eq(chatMetrics.messageId, messageId),
        ),
      )
      .limit(2);

    if (rows.length === 0) {
      return null;
    }

    assert.equal(
      rows.length,
      1,
      'Multiple monitoring records exist for one user message.',
    );

    const metric = rows[0];

    assert.equal(metric.outcome, 'saved');
    assert.equal(metric.storedType, 'array');
    assert.ok(Array.isArray(metric.usage));
    assert.ok(metric.firstTextMs !== null);
    assert.ok(metric.totalMs >= metric.firstTextMs);

    assert.ok(
      metric.usage.some(event => event.stage === 'assistant'),
      'Assistant usage is missing.',
    );

    assert.ok(
      metric.usage.some(event => event.stage === 'embedding'),
      'Search embedding usage is missing.',
    );

    return metric;
  }, 'the chat monitoring record');
};

export const extractApplicationContexts = (
  parts: Array<Record<string, unknown>>,
) => {
  const contexts: Array<z.infer<typeof contextSchema>> = [];
  const seen = new Set<string>();

  for (const part of parts) {
    if (part.type !== 'tool-output-available') {
      continue;
    }

    const parsed = searchOutputSchema.safeParse(part.output);

    if (parsed.success === false) {
      continue;
    }

    for (const context of parsed.data.results) {
      const key = JSON.stringify(context);

      if (!seen.has(key)) {
        seen.add(key);
        contexts.push(context);
      }
    }
  }

  return contexts;
};