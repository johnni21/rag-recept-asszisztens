import {
  convertToModelMessages,
  generateId,
  streamText,
  validateUIMessages,
} from 'ai';
import type {
  InferUITools,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  ASSISTANT_MODEL,
  getAssistantConfig,
} from '@/lib/ai/assistant';
import {
  loadConversation,
  saveConversationMessages,
} from '@/lib/chat/conversations';
import type { ChatMetricOutcome } from '@/lib/db/schema/chat-metrics';
import { saveChatMeasurement } from '@/lib/monitoring/store';
import { createUsageCollector } from '@/lib/monitoring/usage';

export const maxDuration = 60;

const userMessageSchema = z.object({
  id: z.string().min(1).max(191),
  role: z.literal('user'),
  parts: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string().trim().min(1).max(20000),
    }),
  ).min(1).max(10),
});

const requestSchema = z.object({
  conversationId: z.string().min(1).max(191),
  revision: z.number().int().min(0),
  message: userMessageSchema,
}).strict();

export async function POST(request: Request) {
  const requestStartedAt = performance.now();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'The request body must be valid JSON.',
      },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);

  if (parsed.success === false) {
    return NextResponse.json(
      {
        success: false,
        error:
          'A conversation ID, revision and user message are required.',
      },
      { status: 400 },
    );
  }

  const { conversationId, revision, message } = parsed.data;

  try {
    const conversation = await loadConversation(conversationId);

    if (conversation === null) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conversation not found.',
        },
        { status: 404 },
      );
    }

    if (conversation.revision !== revision) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The conversation changed. Reload it before continuing.',
        },
        { status: 409 },
      );
    }

    if (
      conversation.messages.some(
        existing => existing.id === message.id,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'This message has already been saved.',
        },
        { status: 409 },
      );
    }

    const collector = createUsageCollector();
    const config = getAssistantConfig(
      undefined,
      collector.record,
    );

    type AssistantMessage = UIMessage<
      unknown,
      UIDataTypes,
      InferUITools<typeof config.tools>
    >;

    const messages = await validateUIMessages<AssistantMessage>({
      messages: [...conversation.messages, message],
      tools: config.tools,
    });

    let completedSuccessfully = false;
    let firstTextMs: number | null = null;
    let generationMs: number | null = null;
    let reported = false;

    const generationStartedAt = performance.now();

    const reportMetrics = async (
      outcome: ChatMetricOutcome,
    ): Promise<void> => {
      if (reported) {
        return;
      }

      reported = true;

      const measurement = {
        conversationId,
        messageId: message.id,
        outcome,
        firstTextMs,
        generationMs,
        totalMs: Math.round(
          performance.now() - requestStartedAt,
        ),
        usage: collector.snapshot(),
      };

      console.info(
        '[chat-metrics]',
        JSON.stringify(measurement),
      );

      try {
        const saved = await saveChatMeasurement(measurement);

        console.info(
          '[chat-metrics-saved]',
          JSON.stringify({ id: saved.id }),
        );
      } catch (error) {
        console.error('Chat metrics persistence failed:', error);
      }
    };

    const result = streamText({
      ...config,
      messages: convertToModelMessages(messages),
      abortSignal: AbortSignal.timeout(120_000),
      onChunk: ({ chunk }) => {
        if (
          chunk.type === 'text-delta' &&
          firstTextMs === null
        ) {
          firstTextMs = Math.round(
            performance.now() - requestStartedAt,
          );
        }
      },
      onFinish: ({ finishReason, totalUsage }) => {
        generationMs = Math.round(
          performance.now() - generationStartedAt,
        );

        collector.record({
          stage: 'assistant',
          model: ASSISTANT_MODEL,
          usage: totalUsage,
          durationMs: generationMs,
        });

        completedSuccessfully = finishReason === 'stop';
      },
      onError: ({ error }) => {
        console.error('Chat generation failed:', error);
      },
    });

    void result.consumeStream({
      onError: error => {
        console.error('Chat stream consumption failed:', error);
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: generateId,
      headers: {
        'Cache-Control': 'no-store',
      },
      onFinish: async ({
        messages: completedMessages,
        isAborted,
      }) => {
        if (isAborted || completedSuccessfully === false) {
          await reportMetrics('not-saved');
          return;
        }

        try {
          await saveConversationMessages({
            id: conversationId,
            expectedRevision: revision,
            messages: completedMessages,
          });
        } catch (error) {
          await reportMetrics('save-failed');
          throw error;
        }

        await reportMetrics('saved');
      },
      onError: error => {
        console.error(
          'Chat response or persistence failed:',
          error,
        );

        return (
          'A válasz elkészítése vagy mentése sikertelen. ' +
          'Töltsd újra a beszélgetést.'
        );
      },
    });
  } catch (error) {
    console.error('Chat request failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'The chat request could not be completed.',
      },
      { status: 500 },
    );
  }
}